import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';

import PoiMap from '../components/PoiMap';
import { apiClient } from '../lib/apiClient';
import {
  TRAIL_CHECKPOINT_RADIUS_M,
  TRAIL_OFF_ROUTE_WARNING_M,
  TRAIL_RUN_DISTANCE_INTERVAL_M,
  TRAIL_RUN_UPDATE_MS,
} from '../lib/constants';
import { buildCheckinPayload, calculateDistance } from '../lib/gpsVerifier';
import {
  createCheckpointKey,
  getDistanceFromRoute,
  getDownloadedTrail,
  getNextCheckpoint,
  routeToPois,
  saveDownloadedTrail,
} from '../lib/trailManager';
import type { GPSPosition, RouteSummary } from '../lib/types';

function toGpsPosition(location: Location.LocationObject): GPSPosition {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 0,
    timestamp: location.timestamp,
  };
}

function getMapRegion(route: RouteSummary | null) {
  const firstPoint = route?.route_points?.[0];
  const firstCheckpoint = route?.checkpoints?.[0];
  return {
    latitude: firstPoint?.latitude ?? firstCheckpoint?.latitude ?? 59.3293,
    longitude: firstPoint?.longitude ?? firstCheckpoint?.longitude ?? 18.0686,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  };
}

export default function TrailRunScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const routeId = Array.isArray(params.routeId) ? params.routeId[0] : params.routeId;

  const mapRef = useRef<any>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const completedKeysRef = useRef<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completedKeys, setCompletedKeys] = useState<string[]>([]);
  const [currentPosition, setCurrentPosition] = useState<GPSPosition | null>(null);
  const [offRouteMeters, setOffRouteMeters] = useState<number | null>(null);
  const [guidance, setGuidance] = useState('Download the trail pack, then start the run when you are ready.');

  const checkpointPois = useMemo(() => (route ? routeToPois(route) : []), [route]);
  const nextCheckpoint = useMemo(
    () => (route ? getNextCheckpoint(route, completedKeys) : null),
    [route, completedKeys],
  );

  const stopWatching = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setRunning(false);
  }, []);

  const loadRoute = useCallback(async () => {
    if (!routeId) {
      setLoading(false);
      return;
    }

    try {
      const cached = await getDownloadedTrail(routeId);
      if (cached) {
        setRoute(cached);
        setIsDownloaded(true);
      }

      const fresh = await apiClient.getRouteById(routeId).catch(() => null as RouteSummary | null);
      if (fresh) {
        setRoute(fresh);
      }
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void loadRoute();
    return () => stopWatching();
  }, [loadRoute, stopWatching]);

  const handleDownload = useCallback(async () => {
    if (!routeId) return;
    setDownloading(true);
    try {
      const fullRoute = route?.route_points?.length ? route : await apiClient.getRouteById(routeId);
      await saveDownloadedTrail(fullRoute);
      setRoute(fullRoute);
      setIsDownloaded(true);
      Alert.alert('Trail downloaded', 'The route line, POIs, and guidance cues are now saved for offline use.');
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'Could not save this trail pack right now.');
    } finally {
      setDownloading(false);
    }
  }, [route, routeId]);

  const finishTrailRun = useCallback(async (completed: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    stopWatching();

    const activeSessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setSessionId(null);

    try {
      if (completed && route && activeSessionId) {
        const result = await apiClient.completeRoute(route.id, activeSessionId);
        Alert.alert('Trail complete', `Route finished and recorded. Total completions: ${result.completion_count}.`);
      } else if (completed) {
        Alert.alert('Trail complete', 'All required POIs were reached and the run has been saved locally.');
      }
    } catch (err: any) {
      setGuidance(err?.message || 'Run stopped. You may need to reach the remaining required POIs.');
    } finally {
      if (!completed) {
        setGuidance('Trail run paused. Resume when you are ready.');
      }
      finishingRef.current = false;
    }
  }, [route, stopWatching]);

  const markCheckpointComplete = useCallback(async (position: GPSPosition) => {
    if (!route) return;

    const info = getNextCheckpoint(route, completedKeysRef.current);
    if (!info) {
      await finishTrailRun(true);
      return;
    }

    if (completedKeysRef.current.includes(info.key)) return;

    const nextKeys = [...completedKeysRef.current, info.key];
    completedKeysRef.current = nextKeys;
    setCompletedKeys(nextKeys);

    if (info.checkpoint.poi_id && sessionIdRef.current) {
      try {
        const payload = await buildCheckinPayload(info.checkpoint.poi_id, position, sessionIdRef.current);
        await apiClient.checkin(payload);
      } catch {
        // local completion still counts for offline guidance
      }
    }

    if (nextKeys.length >= (route.checkpoints?.length || 0)) {
      setGuidance('Finish POI reached. Wrapping up your trail run now.');
      await finishTrailRun(true);
      return;
    }

    setGuidance(`${info.checkpoint.title} checked in. Continue to the next POI.`);
  }, [finishTrailRun, route]);

  const processLocationUpdate = useCallback(async (position: GPSPosition) => {
    if (!route) return;

    setCurrentPosition(position);

    const routeDistance = getDistanceFromRoute(position, route.route_points || []);
    setOffRouteMeters(Math.round(routeDistance));

    const next = getNextCheckpoint(route, completedKeysRef.current);
    if (!next) {
      setGuidance('All required POIs have been reached. Finish the trail to complete the run.');
      return;
    }

    const distanceToCheckpoint = calculateDistance(position, {
      latitude: next.checkpoint.latitude,
      longitude: next.checkpoint.longitude,
    });

    if (routeDistance > TRAIL_OFF_ROUTE_WARNING_M) {
      setGuidance(`You are ${Math.round(routeDistance)}m off route. Head back toward ${next.checkpoint.title}.`);
    } else if (distanceToCheckpoint >= 1000) {
      setGuidance(`${next.checkpoint.title} is ${(distanceToCheckpoint / 1000).toFixed(1)} km ahead. Stay on the trail line.`);
    } else {
      setGuidance(`Next POI: ${next.checkpoint.title} · ${Math.round(distanceToCheckpoint)}m away.`);
    }

    if (distanceToCheckpoint <= TRAIL_CHECKPOINT_RADIUS_M) {
      await markCheckpointComplete(position);
    }
  }, [markCheckpointComplete, route]);

  const handleStartRun = useCallback(async () => {
    if (!route) return;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('GPS required', 'Allow location access so the app can guide you along the trail.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const currentGps = toGpsPosition(current);
      await processLocationUpdate(currentGps);

      const started = await apiClient.startRoute(route.id).catch(() => null as { session_id: string; status: string } | null);
      sessionIdRef.current = started?.session_id ?? null;
      setSessionId(started?.session_id ?? null);

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          activityType: Location.ActivityType.Fitness,
          timeInterval: TRAIL_RUN_UPDATE_MS,
          distanceInterval: TRAIL_RUN_DISTANCE_INTERVAL_M,
        },
        (update) => {
          void processLocationUpdate(toGpsPosition(update));
        },
      );

      watchRef.current = subscription;
      setRunning(true);
      setGuidance('Trail run started. The app will guide you while keeping GPS usage battery-safe.');
    } catch (err: any) {
      Alert.alert('Could not start run', err?.message || 'Trail tracking is unavailable right now.');
    }
  }, [processLocationUpdate, route]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!route) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Trail not found</Text>
        <Text style={styles.emptyText}>Open a saved trail from the app feed and try again.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Battery-safe trail running</Text>
        <Text style={styles.heroTitle}>{route.name}</Text>
        <Text style={styles.heroText}>
          Download the trail pack for offline guidance, then start the run. GPS only samples every few seconds while the run is active to reduce battery drain.
        </Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.distance_km.toFixed(1)} km</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.checkpoints?.length || route.poi_count || 0}</Text>
          <Text style={styles.statLabel}>POIs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.estimated_duration_min || 0} min</Text>
          <Text style={styles.statLabel}>ETA</Text>
        </View>
      </View>

      <PoiMap
        mapRef={mapRef}
        style={styles.map}
        initialRegion={getMapRegion(route)}
        pois={checkpointPois}
        routePoints={route.route_points || []}
      />

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionButton, styles.downloadButton]} onPress={handleDownload} disabled={downloading}>
          <Text style={styles.actionButtonText}>{downloading ? 'Saving…' : isDownloaded ? 'Trail Pack Saved' : 'Download Map Data'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, running ? styles.stopButton : styles.startButton]} onPress={running ? () => void finishTrailRun(false) : handleStartRun}>
          <Text style={styles.actionButtonText}>{running ? 'Stop Trail Run' : 'Start Trail Run'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.guidanceCard}>
        <Text style={styles.guidanceTitle}>Live guidance</Text>
        <Text style={styles.guidanceText}>{guidance}</Text>
        <Text style={styles.guidanceMeta}>
          {nextCheckpoint ? `Next: ${nextCheckpoint.checkpoint.title}` : 'All required POIs complete'}
          {offRouteMeters !== null ? ` · Off-route: ${offRouteMeters}m` : ''}
          {sessionId ? ' · Run active' : ''}
        </Text>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>POI progress</Text>
        {(route.checkpoints || []).map((checkpoint, index) => {
          const key = createCheckpointKey(checkpoint, index);
          const done = completedKeys.includes(key);
          return (
            <View key={key} style={styles.progressRow}>
              <View style={[styles.progressDot, done && styles.progressDotDone]} />
              <View style={styles.progressCopy}>
                <Text style={styles.progressName}>{checkpoint.title}</Text>
                <Text style={styles.progressMeta}>{checkpoint.role || 'checkpoint'} · {checkpoint.is_required === false ? 'optional' : 'required'}</Text>
              </View>
              <Text style={[styles.progressStatus, done && styles.progressStatusDone]}>{done ? 'Done' : 'Ahead'}</Text>
            </View>
          );
        })}
      </View>

      {currentPosition ? (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Live position</Text>
          <Text style={styles.positionText}>
            {currentPosition.latitude.toFixed(5)}, {currentPosition.longitude.toFixed(5)}
          </Text>
          <Text style={styles.positionText}>Accuracy: {Math.round(currentPosition.accuracy)}m</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptyText: {
    marginTop: 8,
    color: '#64748b',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  heroEyebrow: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  heroText: {
    color: '#cbd5e1',
    marginTop: 8,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: {
    marginTop: 4,
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  map: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  downloadButton: {
    backgroundColor: '#1d4ed8',
  },
  startButton: {
    backgroundColor: '#10b981',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  guidanceCard: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  guidanceTitle: {
    color: '#065f46',
    fontSize: 16,
    fontWeight: '800',
  },
  guidanceText: {
    color: '#065f46',
    marginTop: 6,
    lineHeight: 20,
  },
  guidanceMeta: {
    color: '#047857',
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#cbd5e1',
    marginRight: 10,
  },
  progressDotDone: {
    backgroundColor: '#10b981',
  },
  progressCopy: {
    flex: 1,
  },
  progressName: {
    color: '#0f172a',
    fontWeight: '700',
  },
  progressMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  progressStatus: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 12,
  },
  progressStatusDone: {
    color: '#047857',
  },
  positionText: {
    color: '#475569',
    marginTop: 4,
  },
});