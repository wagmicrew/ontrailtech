import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';

import PoiMap from '../../components/PoiMap';
import { apiClient } from '../../lib/apiClient';
import { enqueueIfOffline, isOnline } from '../../lib/cachedApi';
import { calculateDistance } from '../../lib/gpsVerifier';
import { getLocalTrailDrafts, removeLocalTrailDraft, saveDownloadedTrail, saveLocalTrailDraft } from '../../lib/trailManager';
import type { CreateRoutePayload, POI, RoutePoint, RouteSummary } from '../../lib/types';

const DEFAULT_REGION = {
  latitude: 59.3293,
  longitude: 18.0686,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert'] as const;

type BuildMode = 'auto' | 'manual';

type PoiDraft = {
  title: string;
  body: string;
  photo_url: string;
};

function getRarityColor(rarity: string): string {
  if (rarity === 'rare') return '#3b82f6';
  if (rarity === 'epic') return '#a855f7';
  if (rarity === 'legendary') return '#eab308';
  return '#22c55e';
}

function distanceFromStart(routePoints: RoutePoint[], latitude: number, longitude: number): number {
  if (!routePoints.length) return 0;
  return Math.round(
    calculateDistance(
      { latitude: routePoints[0].latitude, longitude: routePoints[0].longitude },
      { latitude, longitude },
    ),
  );
}

function totalRouteDistanceKm(routePoints: RoutePoint[]): number {
  if (routePoints.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < routePoints.length; index += 1) {
    total += calculateDistance(routePoints[index - 1], routePoints[index]);
  }
  return total / 1000;
}

function buildLocalRouteSummary(
  payload: CreateRoutePayload,
  routePoints: RoutePoint[],
  selectedPois: POI[],
): RouteSummary {
  return {
    id: `local-${Date.now()}`,
    name: payload.name,
    difficulty: payload.difficulty || 'moderate',
    distance_km: Math.max(totalRouteDistanceKm(routePoints), 0.1),
    completion_count: 0,
    description: payload.description,
    build_mode: payload.build_mode,
    is_loop: payload.is_loop,
    is_minted: payload.is_minted,
    poi_count: selectedPois.length,
    start_poi_name: selectedPois[0]?.name || null,
    end_poi_name: selectedPois[selectedPois.length - 1]?.name || null,
    estimated_duration_min: payload.estimated_duration_min,
    route_points: payload.route_points || [],
    checkpoints: payload.checkpoints || [],
    poi_ids: payload.poi_ids,
    local_only: true,
    sync_status: 'pending',
  };
}

export default function StudioScreen() {
  const mapRef = useRef<any>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<BuildMode>('auto');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('moderate');
  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [isLoop, setIsLoop] = useState(false);
  const [isMinted, setIsMinted] = useState(false);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([]);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<RouteSummary[]>([]);
  const [poiDrafts, setPoiDrafts] = useState<Record<string, PoiDraft>>({});
  const [currentCoords, setCurrentCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [isOnlineState, setIsOnlineState] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const selectedPois = useMemo(
    () => selectedPoiIds.map((id) => pois.find((poi) => poi.id === id)).filter(Boolean) as POI[],
    [pois, selectedPoiIds],
  );

  const activePoi = useMemo(
    () => selectedPois.find((poi) => poi.id === activePoiId) || null,
    [activePoiId, selectedPois],
  );

  const activePoiRole = activePoi
    ? selectedPoiIds[0] === activePoi.id
      ? 'start'
      : selectedPoiIds[selectedPoiIds.length - 1] === activePoi.id
        ? 'finish'
        : 'checkpoint'
    : null;

  const stopRecording = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setRecording(false);
  }, []);

  const fetchMyRoutes = useCallback(async () => {
    try {
      const [routes, drafts] = await Promise.all([
        apiClient.getMyRoutes().catch(() => [] as RouteSummary[]),
        getLocalTrailDrafts().catch(() => [] as RouteSummary[]),
      ]);

      const syncedDraftIds = drafts
        .filter((draft) => routes.some((route) => route.name === draft.name && Math.abs(route.distance_km - draft.distance_km) < 0.25))
        .map((draft) => draft.id);

      await Promise.all(syncedDraftIds.map((id) => removeLocalTrailDraft(id)));

      const remainingDrafts = drafts.filter((draft) => !syncedDraftIds.includes(draft.id));
      setPendingSyncCount(remainingDrafts.length);
      setSavedRoutes([...remainingDrafts, ...routes]);
    } catch {
      const drafts = await getLocalTrailDrafts().catch(() => [] as RouteSummary[]);
      setPendingSyncCount(drafts.length);
      setSavedRoutes(drafts);
    }
  }, []);

  const fetchNearbyPois = useCallback(async (latitude: number, longitude: number) => {
    try {
      const nearby = await apiClient.getNearbyPois(latitude, longitude, 12);
      setPois(nearby.slice(0, 12));
    } catch {
      // keep existing POIs if fetch fails
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnlineState(!!(state.isConnected && state.isInternetReachable !== false));
    });

    void isOnline().then(setIsOnlineState).catch(() => undefined);
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) setLoading(false);
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (!active) return;

        setCurrentCoords(current.coords);
        setRegion({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        });

        await Promise.all([
          fetchNearbyPois(current.coords.latitude, current.coords.longitude),
          fetchMyRoutes(),
        ]);
      } catch {
        // leave fallbacks visible
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      stopRecording();
    };
  }, [fetchMyRoutes, fetchNearbyPois, stopRecording]);

  useEffect(() => {
    if (!activePoiId && selectedPoiIds.length > 0) {
      setActivePoiId(selectedPoiIds[0]);
    }
    if (activePoiId && !selectedPoiIds.includes(activePoiId)) {
      setActivePoiId(selectedPoiIds[0] || null);
    }
  }, [activePoiId, selectedPoiIds]);

  useEffect(() => {
    if (isOnlineState) {
      void fetchMyRoutes();
    }
  }, [fetchMyRoutes, isOnlineState]);

  const addRoutePoint = useCallback((latitude: number, longitude: number, manual = false) => {
    setRoutePoints((prev) => [
      ...prev,
      {
        latitude,
        longitude,
        altitude: currentCoords?.altitude ?? null,
        label: manual ? `Manual ${prev.length + 1}` : `Track ${prev.length + 1}`,
        timestamp: new Date().toISOString(),
        manual,
      },
    ]);
  }, [currentCoords?.altitude]);

  const handleManualTap = useCallback((coordinate: { latitude: number; longitude: number }) => {
    if (mode !== 'manual') return;
    addRoutePoint(coordinate.latitude, coordinate.longitude, true);
  }, [addRoutePoint, mode]);

  const handleDragPoint = useCallback((index: number, coordinate: { latitude: number; longitude: number }) => {
    setRoutePoints((prev) => prev.map((point, pointIndex) => (
      pointIndex === index
        ? { ...point, latitude: coordinate.latitude, longitude: coordinate.longitude, manual: true }
        : point
    )));
  }, []);

  const handleSnapshot = useCallback(async () => {
    try {
      const nextLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentCoords(nextLocation.coords);
      addRoutePoint(nextLocation.coords.latitude, nextLocation.coords.longitude, mode === 'manual');
    } catch {
      Alert.alert('GPS unavailable', 'Move outside and try again to capture a route point.');
    }
  }, [addRoutePoint, mode]);

  const handleStartRecording = useCallback(async () => {
    try {
      if (recording) return;

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (update) => {
          setCurrentCoords(update.coords);
          setRegion((prev) => ({
            ...prev,
            latitude: update.coords.latitude,
            longitude: update.coords.longitude,
          }));

          setRoutePoints((prev) => {
            const lastPoint = prev[prev.length - 1];
            const nextPoint: RoutePoint = {
              latitude: update.coords.latitude,
              longitude: update.coords.longitude,
              altitude: update.coords.altitude ?? null,
              label: `Track ${prev.length + 1}`,
              timestamp: new Date(update.timestamp).toISOString(),
              manual: false,
            };

            if (!lastPoint) return [nextPoint];

            const movement = calculateDistance(
              { latitude: lastPoint.latitude, longitude: lastPoint.longitude },
              { latitude: nextPoint.latitude, longitude: nextPoint.longitude },
            );

            return movement >= 5 ? [...prev, nextPoint] : prev;
          });
        },
      );

      watchRef.current = subscription;
      setRecording(true);
    } catch {
      Alert.alert('Recording unavailable', 'Location access is required to record a trail automatically.');
    }
  }, [recording]);

  const handleSelectPoi = useCallback((poi: POI) => {
    setActivePoiId(poi.id);
    setSelectedPoiIds((prev) => (prev.includes(poi.id) ? prev : [...prev, poi.id]));
    setPoiDrafts((prev) => ({
      ...prev,
      [poi.id]: prev[poi.id] || {
        title: poi.name,
        body: poi.description || '',
        photo_url: '',
      },
    }));
  }, []);

  const removeSelectedPoi = useCallback((poiId: string) => {
    setSelectedPoiIds((prev) => prev.filter((id) => id !== poiId));
    setActivePoiId((current) => (current === poiId ? null : current));
  }, []);

  const setPoiRole = useCallback((poiId: string, role: 'start' | 'finish') => {
    setSelectedPoiIds((prev) => {
      const filtered = prev.filter((id) => id !== poiId);
      return role === 'start' ? [poiId, ...filtered] : [...filtered, poiId];
    });
    setActivePoiId(poiId);
  }, []);

  const updatePoiDraft = useCallback((poiId: string, patch: Partial<PoiDraft>) => {
    setPoiDrafts((prev) => ({
      ...prev,
      [poiId]: {
        title: prev[poiId]?.title || '',
        body: prev[poiId]?.body || '',
        photo_url: prev[poiId]?.photo_url || '',
        ...patch,
      },
    }));
  }, []);

  const handleSaveRoute = useCallback(async () => {
    if (!routeName.trim()) {
      Alert.alert('Route name needed', 'Give the route a name before saving it.');
      return;
    }

    if (selectedPoiIds.length < 2) {
      Alert.alert('Start and end POIs required', 'Select at least two POIs so the route has a start and finish.');
      return;
    }

    if (mode === 'auto' && routePoints.length < 2) {
      Alert.alert('Start recording first', 'Capture some live GPS points before saving an automatic trail.');
      return;
    }

    if (mode === 'manual' && routePoints.length < 2) {
      Alert.alert('Add route points', 'Tap the map or use the snapshot button to create a manual trail line.');
      return;
    }

    setSaving(true);
    try {
      const orderedPoiIds = [...selectedPoiIds];
      if (isLoop && orderedPoiIds[0] !== orderedPoiIds[orderedPoiIds.length - 1]) {
        orderedPoiIds.push(orderedPoiIds[0]);
      }

      const checkpoints = selectedPois.map((poi, index) => ({
        poi_id: poi.id,
        title: poiDrafts[poi.id]?.title || poi.name,
        body: poiDrafts[poi.id]?.body || poi.description || '',
        photo_url: poiDrafts[poi.id]?.photo_url || '',
        latitude: poi.latitude,
        longitude: poi.longitude,
        altitude: currentCoords?.altitude ?? null,
        distance_from_start_m: distanceFromStart(routePoints, poi.latitude, poi.longitude),
        is_required: true,
        role: index === 0 ? 'start' : index === selectedPois.length - 1 ? 'finish' : 'checkpoint',
      }));

      const payload: CreateRoutePayload = {
        name: routeName.trim(),
        description: routeDescription.trim(),
        difficulty,
        estimated_duration_min: Math.max(20, routePoints.length * 3),
        poi_ids: orderedPoiIds,
        build_mode: mode,
        is_loop: isLoop,
        is_minted: isMinted,
        route_points: routePoints.slice(0, 300),
        checkpoints,
      };

      if (await isOnline()) {
        const route = await apiClient.createRoute(payload);
        await saveDownloadedTrail(route);
        Alert.alert('Trail Lab saved', `${route.name} was saved on your phone and synced to the database.`);
      } else {
        const localRoute = buildLocalRouteSummary(payload, routePoints, selectedPois);
        await saveDownloadedTrail(localRoute);
        await saveLocalTrailDraft(localRoute, payload);
        await enqueueIfOffline<RouteSummary>('/route/create', 'POST', JSON.stringify(payload));
        Alert.alert('Saved offline', 'The trail is stored on the device and will sync to the database when network returns.');
      }

      await fetchMyRoutes();
      setRouteName('');
      setRouteDescription('');
      setRoutePoints([]);
      setSelectedPoiIds([]);
      setActivePoiId(null);
      setPoiDrafts({});
      stopRecording();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Could not save this route right now.');
    } finally {
      setSaving(false);
    }
  }, [currentCoords?.altitude, difficulty, fetchMyRoutes, isLoop, isMinted, mode, poiDrafts, routeDescription, routeName, routePoints, selectedPoiIds, selectedPois, stopRecording]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Trail Lab</Text>
        <Text style={styles.heroTitle}>Build and edit trails with live POI drawers</Text>
        <Text style={styles.heroText}>
          Choose Auto plus POI to record the real trail, or Manual plus POI to draw and drag your route points before saving locally and syncing to the database.
        </Text>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, isOnlineState ? styles.statusPillOnline : styles.statusPillOffline]}>
          <Text style={[styles.statusPillText, isOnlineState ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
            {isOnlineState ? 'Online sync active' : 'Offline draft mode'}
          </Text>
        </View>
        {pendingSyncCount > 0 ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{pendingSyncCount} pending sync</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modePill, mode === 'auto' && styles.modePillActive]}
          onPress={() => setMode('auto')}
        >
          <Text style={[styles.modeText, mode === 'auto' && styles.modeTextActive]}>Auto + POI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modePill, mode === 'manual' && styles.modePillActive]}
          onPress={() => setMode('manual')}
        >
          <Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>Manual + POI</Text>
        </TouchableOpacity>
      </View>

      <PoiMap
        mapRef={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        pois={pois}
        getRarityColor={getRarityColor}
        onSelectPoi={handleSelectPoi}
        routePoints={routePoints}
        editableRoute={mode === 'manual'}
        onMapPress={handleManualTap}
        onDragPoint={handleDragPoint}
      />

      <Text style={styles.helperText}>
        {mode === 'manual'
          ? 'Tap the map to add line points and drag markers to reshape the path.'
          : 'Start recording, then use Snapshot to pin key moments and add required POI check-ins.'}
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Mobile telemetry</Text>
        <Text style={styles.metaText}>Height: {Math.round(currentCoords?.altitude || 0)} m</Text>
        <Text style={styles.metaText}>Tracked route distance: {totalRouteDistanceKm(routePoints).toFixed(2)} km</Text>
        <Text style={styles.metaText}>Captured points: {routePoints.length}</Text>
      </View>

      <View style={styles.actionRow}>
        {mode === 'auto' ? (
          <TouchableOpacity
            style={[styles.actionButton, recording ? styles.stopButton : styles.primaryButton]}
            onPress={recording ? stopRecording : handleStartRecording}
          >
            <Text style={styles.actionButtonText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleSnapshot}
          >
            <Text style={styles.actionButtonText}>Add Point</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} onPress={handleSnapshot}>
          <Text style={styles.secondaryButtonText}>Snapshot</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Route setup</Text>
        <TextInput
          style={styles.input}
          value={routeName}
          onChangeText={setRouteName}
          placeholder="Trail name"
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          value={routeDescription}
          onChangeText={setRouteDescription}
          placeholder="What makes this trail special for explorers and supporters?"
          placeholderTextColor="#94a3b8"
          multiline
        />

        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.chipRow}>
          {DIFFICULTIES.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, difficulty === option && styles.chipActive]}
              onPress={() => setDifficulty(option)}
            >
              <Text style={[styles.chipText, difficulty === option && styles.chipTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>Round trip route</Text>
            <Text style={styles.switchSubtitle}>Save it as a loop that finishes where it started</Text>
          </View>
          <Switch value={isLoop} onValueChange={setIsLoop} trackColor={{ false: '#cbd5e1', true: '#86efac' }} />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>Mint protect this trail</Text>
            <Text style={styles.switchSubtitle}>Blocks close fuzzy matches against other minted routes</Text>
          </View>
          <Switch value={isMinted} onValueChange={setIsMinted} trackColor={{ false: '#cbd5e1', true: '#c4b5fd' }} />
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Start and end POIs</Text>
        <Text style={styles.helperTextSecondary}>
          Every selected POI becomes a required check-in. The first is the start and the last is the finish.
        </Text>

        <View style={styles.selectionSummary}>
          <Text style={styles.selectionLabel}>Start</Text>
          <Text style={styles.selectionValue}>{selectedPois[0]?.name || 'Choose a POI below'}</Text>
        </View>
        <View style={styles.selectionSummary}>
          <Text style={styles.selectionLabel}>Finish</Text>
          <Text style={styles.selectionValue}>{selectedPois[selectedPois.length - 1]?.name || 'Choose a POI below'}</Text>
        </View>

        <View style={styles.poiChipWrap}>
          {pois.map((poi) => {
            const active = selectedPoiIds.includes(poi.id);
            return (
              <TouchableOpacity
                key={poi.id}
                style={[styles.poiChip, active && styles.poiChipActive, activePoiId === poi.id && styles.poiChipEditing]}
                onPress={() => handleSelectPoi(poi)}
              >
                <Text style={[styles.poiChipText, active && styles.poiChipTextActive]}>{poi.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {activePoi ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>POI detail drawer</Text>
          <Text style={styles.helperTextSecondary}>
            Edit details, image, telemetry notes, and set this POI as the route start or finish.
          </Text>

          {poiDrafts[activePoi.id]?.photo_url ? (
            <Image source={{ uri: poiDrafts[activePoi.id]?.photo_url || '' }} style={styles.poiPreviewImage} />
          ) : null}

          <View style={styles.roleRow}>
            <TouchableOpacity style={[styles.roleButton, activePoiRole === 'start' && styles.roleButtonActive]} onPress={() => setPoiRole(activePoi.id, 'start')}>
              <Text style={[styles.roleButtonText, activePoiRole === 'start' && styles.roleButtonTextActive]}>Set as Start</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleButton, activePoiRole === 'finish' && styles.roleButtonActive]} onPress={() => setPoiRole(activePoi.id, 'finish')}>
              <Text style={[styles.roleButtonText, activePoiRole === 'finish' && styles.roleButtonTextActive]}>Set as Finish</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removePoiButton} onPress={() => removeSelectedPoi(activePoi.id)}>
              <Text style={styles.removePoiButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            value={poiDrafts[activePoi.id]?.title || activePoi.name}
            onChangeText={(value) => updatePoiDraft(activePoi.id, { title: value })}
            placeholder="POI heading"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, styles.textarea]}
            value={poiDrafts[activePoi.id]?.body || activePoi.description || ''}
            onChangeText={(value) => updatePoiDraft(activePoi.id, { body: value })}
            placeholder="Full POI story, notes, height, and why runners should stop here"
            placeholderTextColor="#94a3b8"
            multiline
          />
          <TextInput
            style={styles.input}
            value={poiDrafts[activePoi.id]?.photo_url || ''}
            onChangeText={(value) => updatePoiDraft(activePoi.id, { photo_url: value })}
            placeholder="Optional photo URL"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.metaText}>
            Height from device telemetry: {Math.round(currentCoords?.altitude || 0)} m
          </Text>
          <Text style={styles.metaText}>
            Distance from route start: {distanceFromStart(routePoints, activePoi.latitude, activePoi.longitude)} m
          </Text>
          <Text style={styles.metaText}>
            Coordinates: {activePoi.latitude.toFixed(5)}, {activePoi.longitude.toFixed(5)}
          </Text>
        </View>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>POI detail drawer</Text>
          <Text style={styles.emptyText}>Tap a POI on the map or in the list above to open its editor drawer.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.saveButton} onPress={handleSaveRoute} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>Save Trail Lab Route</Text>}
      </TouchableOpacity>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Saved trails</Text>
        {savedRoutes.length === 0 ? (
          <Text style={styles.emptyText}>Your saved routes will show up here once you build them.</Text>
        ) : (
          savedRoutes.slice(0, 5).map((route) => (
            <View key={route.id} style={styles.savedRouteCard}>
              <View style={styles.savedRouteHeader}>
                <Text style={styles.savedRouteName}>{route.name}</Text>
                <Text style={styles.savedRouteBadge}>{route.sync_status === 'pending' ? 'pending sync' : route.build_mode || 'manual'}</Text>
              </View>
              <Text style={styles.savedRouteMeta}>
                {route.distance_km.toFixed(1)} km · {route.poi_count || 0} POIs · {route.is_minted ? 'Minted' : route.local_only ? 'Local draft' : 'Draft'}
              </Text>
              <Text style={styles.savedRouteMeta}>
                {route.start_poi_name || 'Start'} → {route.end_poi_name || 'Finish'}
              </Text>
            </View>
          ))
        )}
      </View>
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
    paddingBottom: 34,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#e2e8f0',
  },
  statusPillOnline: {
    backgroundColor: '#dcfce7',
  },
  statusPillOffline: {
    backgroundColor: '#fee2e2',
  },
  statusPillText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  statusPillTextOnline: {
    color: '#047857',
  },
  statusPillTextOffline: {
    color: '#b91c1c',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  modePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modePillActive: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  modeText: {
    color: '#475569',
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#047857',
  },
  map: {
    height: 250,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
  },
  helperText: {
    color: '#475569',
    marginBottom: 10,
  },
  helperTextSecondary: {
    color: '#64748b',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#10b981',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  label: {
    marginTop: 8,
    marginBottom: 8,
    color: '#334155',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    marginBottom: 10,
  },
  textarea: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
  },
  chipActive: {
    backgroundColor: '#0f172a',
  },
  chipText: {
    color: '#475569',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  switchTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  switchSubtitle: {
    color: '#64748b',
    marginTop: 2,
    fontSize: 12,
  },
  selectionSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectionLabel: {
    color: '#475569',
    fontWeight: '700',
  },
  selectionValue: {
    color: '#0f172a',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  poiChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  poiChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  poiChipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  poiChipEditing: {
    borderColor: '#0f172a',
    borderWidth: 2,
  },
  poiChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  poiChipTextActive: {
    color: '#047857',
  },
  poiPreviewImage: {
    height: 140,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#e2e8f0',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  roleButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
  },
  roleButtonActive: {
    backgroundColor: '#0f172a',
  },
  roleButtonText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  removePoiButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
  },
  removePoiButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
  },
  metaText: {
    color: '#64748b',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  emptyText: {
    color: '#64748b',
  },
  savedRouteCard: {
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    padding: 12,
    marginTop: 8,
  },
  savedRouteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedRouteName: {
    flex: 1,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 10,
  },
  savedRouteBadge: {
    backgroundColor: '#dcfce7',
    color: '#047857',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  savedRouteMeta: {
    color: '#475569',
    marginTop: 4,
  },
});