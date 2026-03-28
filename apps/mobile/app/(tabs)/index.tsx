import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import * as stepTracker from '../../lib/stepTracker';
import { apiClient } from '../../lib/apiClient';
import { STORAGE_KEYS, POI_NEARBY_RADIUS_KM } from '../../lib/constants';
import type { POI } from '../../lib/types';

// Rarity badge colors
const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

export default function HomeScreen() {
  const [steps, setSteps] = useState<number>(0);
  const [pedometerAvailable, setPedometerAvailable] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pois, setPois] = useState<POI[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load step count (from pedometer or cache)
  const loadSteps = useCallback(async (online: boolean) => {
    if (online) {
      try {
        const count = await stepTracker.getCurrentDaySteps();
        setSteps(count);
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_STEPS, String(count));
      } catch {
        // Fall back to cache on error
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STEPS);
        if (cached) setSteps(Number(cached));
      }
    } else {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STEPS);
      if (cached) setSteps(Number(cached));
    }
  }, []);

  // Load nearby POIs (from API or cache)
  const loadPois = useCallback(async (online: boolean) => {
    if (online) {
      try {
        // Use a default location; in production this would come from GPS
        const data = await apiClient.getNearbyPois(0, 0, POI_NEARBY_RADIUS_KM);
        setPois(data.slice(0, 5));
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_POIS, JSON.stringify(data));
      } catch {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_POIS);
        if (cached) {
          const parsed = JSON.parse(cached) as POI[];
          setPois(parsed.slice(0, 5));
        }
      }
    } else {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_POIS);
      if (cached) {
        const parsed = JSON.parse(cached) as POI[];
        setPois(parsed.slice(0, 5));
      }
    }
  }, []);

  // Initial data load
  const loadData = useCallback(async (online: boolean) => {
    await Promise.all([loadSteps(online), loadPois(online)]);
  }, [loadSteps, loadPois]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Check pedometer availability
      const available = await stepTracker.isAvailable();
      if (mounted) setPedometerAvailable(available);

      // Check connectivity
      const netState = await NetInfo.fetch();
      const online = !!(netState.isConnected && netState.isInternetReachable !== false);
      if (mounted) setIsOnline(online);

      await loadData(online);
      if (mounted) setLoading(false);
    })();

    // Subscribe to connectivity changes
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>You are offline — showing cached data</Text>
        </View>
      )}

      {/* Step count card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Steps</Text>
        {pedometerAvailable === false ? (
          <Text style={styles.unavailableText}>
            Step counting unavailable on this device
          </Text>
        ) : (
          <Text style={styles.stepCount}>{steps.toLocaleString()}</Text>
        )}
      </View>

      {/* Activity summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        <Text style={styles.activityText}>
          {steps > 0
            ? `You've taken ${steps.toLocaleString()} steps today. Keep going!`
            : 'No activity recorded yet today.'}
        </Text>
      </View>

      {/* Nearby POIs */}
      <Text style={styles.sectionTitle}>Nearby Points of Interest</Text>
      {pois.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No nearby POIs found</Text>
        </View>
      ) : (
        pois.map((poi) => (
          <View key={poi.id} style={styles.poiCard}>
            <View style={styles.poiHeader}>
              <Text style={styles.poiName}>{poi.name}</Text>
              <View
                style={[
                  styles.rarityBadge,
                  { backgroundColor: RARITY_COLORS[poi.rarity] ?? '#9ca3af' },
                ]}
              >
                <Text style={styles.rarityText}>{poi.rarity}</Text>
              </View>
            </View>
            {poi.description ? (
              <Text style={styles.poiDescription} numberOfLines={2}>
                {poi.description}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },
  offlineBanner: {
    backgroundColor: '#fbbf24',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#78350f',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  stepCount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#15803d',
  },
  unavailableText: {
    fontSize: 14,
    color: '#dc2626',
    fontStyle: 'italic',
  },
  activityText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803d',
    marginTop: 8,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  poiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  poiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poiName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  rarityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  poiDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    lineHeight: 18,
  },
});
