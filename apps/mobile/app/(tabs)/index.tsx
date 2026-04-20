import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';

import * as stepTracker from '../../lib/stepTracker';
import { apiClient } from '../../lib/apiClient';
import { STORAGE_KEYS, POI_NEARBY_RADIUS_KM } from '../../lib/constants';
import { getDownloadedTrailIds, saveDownloadedTrail } from '../../lib/trailManager';
import type { AuthUser, POI, RouteSummary, RunnerProfile } from '../../lib/types';

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

function safeNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

export default function HomeScreen() {
  const router = useRouter();

  const [steps, setSteps] = useState<number>(0);
  const [pedometerAvailable, setPedometerAvailable] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pois, setPois] = useState<POI[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [downloadedTrailIds, setDownloadedTrailIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSteps = useCallback(async (online: boolean) => {
    if (online) {
      try {
        const count = await stepTracker.getCurrentDaySteps();
        setSteps(count);
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_STEPS, String(count));
      } catch {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STEPS);
        if (cached) setSteps(Number(cached));
      }
    } else {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STEPS);
      if (cached) setSteps(Number(cached));
    }
  }, []);

  const loadPois = useCallback(async (online: boolean) => {
    if (online) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        const coords = permission.status === 'granted'
          ? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords
          : null;

        const latitude = coords?.latitude ?? 59.3293;
        const longitude = coords?.longitude ?? 18.0686;
        const data = await apiClient.getNearbyPois(latitude, longitude, POI_NEARBY_RADIUS_KM);
        setPois(data.slice(0, 4));
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_POIS, JSON.stringify(data));
      } catch {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_POIS);
        if (cached) {
          const parsed = JSON.parse(cached) as POI[];
          setPois(parsed.slice(0, 4));
        }
      }
    } else {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_POIS);
      if (cached) {
        const parsed = JSON.parse(cached) as POI[];
        setPois(parsed.slice(0, 4));
      }
    }
  }, []);

  const loadRunner = useCallback(async () => {
    try {
      const me = await apiClient.getMe();
      setUser(me);

      const routePromise = apiClient.getMyRoutes().catch(() => [] as RouteSummary[]);
      const runnerPromise = me.username
        ? apiClient.getRunner(me.username).catch(() => null as RunnerProfile | null)
        : Promise.resolve(null as RunnerProfile | null);

      const [myRoutes, runnerProfile, downloadedIds] = await Promise.all([
        routePromise,
        runnerPromise,
        getDownloadedTrailIds().catch(() => [] as string[]),
      ]);
      setRoutes(myRoutes);
      setRunner(runnerProfile);
      setDownloadedTrailIds(downloadedIds);
    } catch {
      // ignore network failures and keep the app usable
    }
  }, []);

  const loadData = useCallback(async (online: boolean) => {
    await Promise.all([loadSteps(online), loadPois(online), loadRunner()]);
  }, [loadPois, loadRunner, loadSteps]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const available = await stepTracker.isAvailable();
      if (mounted) setPedometerAvailable(available);

      const netState = await NetInfo.fetch();
      const online = !!(netState.isConnected && netState.isInternetReachable !== false);
      if (mounted) setIsOnline(online);

      await loadData(online);
      if (mounted) setLoading(false);
    })();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      if (mounted) setIsOnline(online);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const netState = await NetInfo.fetch();
    const online = !!(netState.isConnected && netState.isInternetReachable !== false);
    setIsOnline(online);
    await loadData(online);
    setRefreshing(false);
  }, [loadData]);

  const handleDownloadTrail = useCallback(async (route: RouteSummary) => {
    try {
      const fullRoute = route.route_points?.length ? route : await apiClient.getRouteById(route.id);
      await saveDownloadedTrail(fullRoute);
      setDownloadedTrailIds((prev) => (prev.includes(route.id) ? prev : [...prev, route.id]));
      Alert.alert('Trail saved offline', 'Map data, route line, and POIs are now available without network access.');
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'Could not save this trail yet.');
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const displayName = user?.username || runner?.username || user?.email || 'Runner';
  const avatarUrl = user?.avatar_url || runner?.avatarUrl || runner?.avatar_url || null;
  const bio = user?.bio || runner?.bio || 'Build trails, grow supporters, tip tokens, and discover new POIs.';
  const supporters = runner?.stats?.totalSupporters || runner?.supporter_count || 0;
  const currentPrice = runner?.friendPass?.currentPrice || String(runner?.friendpass_price || '0.0000');
  const totalTips = runner?.stats?.totalTips || '0.000000';
  const routeCount = routes.length || runner?.route_count || 0;
  const reputation = Math.round(runner?.reputationScore || runner?.reputation || user?.reputation_score || 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Offline mode is on — cached trail data is shown</Text>
        </View>
      )}

      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>OnTrail Social-Fi</Text>
            <Text style={styles.heroTitle}>Welcome back, {displayName}</Text>
            <Text style={styles.heroText}>{bio}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Reputation" value={String(reputation)} accent="#10b981" />
        <StatCard label="Supporters" value={String(supporters)} accent="#38bdf8" />
        <StatCard label="Trails" value={String(routeCount)} accent="#8b5cf6" />
        <StatCard label="Steps today" value={pedometerAvailable === false ? 'N/A' : steps.toLocaleString()} accent="#f59e0b" />
      </View>

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actionGrid}>
        <ActionTile title="Trail Lab" subtitle="Create and own routes" onPress={() => router.push('/(tabs)/studio')} />
        <ActionTile title="Explore POIs" subtitle="Find new places" onPress={() => router.push('/(tabs)/explore')} />
        <ActionTile title="FriendPass" subtitle="Sell supporter access" onPress={() => router.push('/(tabs)/profile')} />
        <ActionTile title="Tip Tokens" subtitle="Open token pages" onPress={() => Linking.openURL('https://app.ontrail.tech/tokens')} />
      </View>

      <Text style={styles.sectionTitle}>Support economy</Text>
      <View style={styles.card}>
        <View style={styles.metricRow}>
          <View>
            <Text style={styles.metricLabel}>FriendPass price</Text>
            <Text style={styles.metricValue}>{currentPrice} ETH</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Tip flow</Text>
            <Text style={styles.metricValue}>{totalTips} ETH</Text>
          </View>
        </View>
        <Text style={styles.cardBody}>
          Sell access, reward early supporters, and use token tips to turn activity into community value.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>My trails</Text>
      {routes.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No routes yet. Open Trail Lab to build your first saved route.</Text>
        </View>
      ) : (
        routes.slice(0, 3).map((route) => {
          const isDownloaded = downloadedTrailIds.includes(route.id);
          return (
            <View key={route.id} style={styles.routeCard}>
              <View style={styles.routeCardHeader}>
                <Text style={styles.routeName}>{route.name}</Text>
                <Text style={styles.routeBadge}>{route.build_mode || 'manual'}</Text>
              </View>
              <Text style={styles.routeMeta}>
                {route.distance_km.toFixed(1)} km · {route.poi_count || 0} POIs · {route.is_minted ? 'Minted' : 'Draft'}
              </Text>
              <Text style={styles.routeMeta}>{route.start_poi_name || 'Start'} → {route.end_poi_name || 'Finish'}</Text>
              <View style={styles.routeActionRow}>
                <TouchableOpacity style={[styles.routeActionButton, styles.runButton]} onPress={() => router.push({ pathname: '/trail-run', params: { routeId: route.id } })}>
                  <Text style={styles.routeActionText}>Run with App</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.routeActionButton, isDownloaded ? styles.savedButton : styles.downloadButton]} onPress={() => handleDownloadTrail(route)}>
                  <Text style={styles.routeActionText}>{isDownloaded ? 'Saved Offline' : 'Download Map'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Nearby POIs</Text>
      {pois.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No nearby POIs found right now.</Text>
        </View>
      ) : (
        pois.map((poi) => (
          <View key={poi.id} style={styles.poiCard}>
            <View style={styles.poiHeader}>
              <Text style={styles.poiName}>{poi.name}</Text>
              <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLORS[poi.rarity] || '#94a3b8' }]}>
                <Text style={styles.rarityText}>{poi.rarity}</Text>
              </View>
            </View>
            {!!poi.description && <Text style={styles.poiDescription}>{poi.description}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionTile({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress}>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  offlineBanner: {
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#92400e',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 13,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 14,
    backgroundColor: '#e2e8f0',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  avatarFallbackText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  heroEyebrow: {
    color: '#86efac',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  heroText: {
    color: '#cbd5e1',
    marginTop: 6,
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    minWidth: '47%',
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    marginTop: 4,
    color: '#64748b',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    marginTop: 4,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  actionTile: {
    minWidth: '47%',
    flex: 1,
    backgroundColor: '#ecfdf5',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  actionTitle: {
    color: '#064e3b',
    fontWeight: '800',
    fontSize: 15,
  },
  actionSubtitle: {
    color: '#047857',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricLabel: {
    color: '#64748b',
    fontWeight: '600',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  cardBody: {
    color: '#475569',
    lineHeight: 20,
  },
  emptyText: {
    color: '#64748b',
  },
  routeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  routeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeName: {
    flex: 1,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 10,
  },
  routeBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  routeMeta: {
    color: '#475569',
    marginTop: 4,
  },
  routeActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  routeActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  runButton: {
    backgroundColor: '#10b981',
  },
  downloadButton: {
    backgroundColor: '#1d4ed8',
  },
  savedButton: {
    backgroundColor: '#0f172a',
  },
  routeActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  poiCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  poiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poiName: {
    flex: 1,
    color: '#0f172a',
    fontWeight: '800',
    marginRight: 8,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  rarityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  poiDescription: {
    color: '#64748b',
    marginTop: 6,
    lineHeight: 18,
  },
});
