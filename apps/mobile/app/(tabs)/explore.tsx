import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import PoiMap from '../../components/PoiMap';
import { apiClient } from '../../lib/apiClient';
import { getDownloadedTrailIds, saveDownloadedTrail } from '../../lib/trailManager';
import {
  calculateDistance,
  verifyProximity,
  buildCheckinPayload,
  getCurrentPosition,
} from '../../lib/gpsVerifier';
import { POI_NEARBY_RADIUS_KM } from '../../lib/constants';
import type { POI, GPSPosition, RouteSummary } from '../../lib/types';

// ---------------------------------------------------------------------------
// Rarity → marker color mapping (Req 10.3)
// ---------------------------------------------------------------------------
const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

/** Return the hex color for a given rarity string. */
export function getRarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] ?? '#9ca3af';
}

// ---------------------------------------------------------------------------
// Default region (fallback when GPS is unavailable)
// ---------------------------------------------------------------------------
const DEFAULT_REGION: Region = {
  latitude: 59.3293,
  longitude: 18.0686,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

export default function ExploreScreen() {
  const router = useRouter();
  const mapRef = useRef<any>(null);

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userPosition, setUserPosition] = useState<GPSPosition | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [trails, setTrails] = useState<RouteSummary[]>([]);
  const [downloadedTrailIds, setDownloadedTrailIds] = useState<string[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsAvailable, setGpsAvailable] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch nearby POIs for a given center (Req 10.2)
  // -----------------------------------------------------------------------
  const fetchPois = useCallback(async (lat: number, lon: number) => {
    try {
      const data = await apiClient.getNearbyPois(lat, lon, POI_NEARBY_RADIUS_KM);
      setPois(data);
    } catch {
      // Silently fail — keep existing markers
    }
  }, []);

  const fetchTrails = useCallback(async () => {
    try {
      const [data, downloadedIds] = await Promise.all([
        apiClient.discoverRoutes(),
        getDownloadedTrailIds().catch(() => [] as string[]),
      ]);
      setTrails(data.slice(0, 4));
      setDownloadedTrailIds(downloadedIds);
    } catch {
      // Keep discovery UI usable even if trail fetch fails
    }
  }, []);

  // -----------------------------------------------------------------------
  // Request location permission and get initial position (Req 10.1, 10.6)
  // -----------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        if (mounted) {
          setGpsAvailable(false);
          setLoading(false);
        }
        return;
      }

      try {
        const pos = await getCurrentPosition(true);
        if (!mounted) return;

        setUserPosition(pos);
        const initialRegion: Region = {
          latitude: pos.latitude,
          longitude: pos.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setRegion(initialRegion);
        await Promise.all([
          fetchPois(pos.latitude, pos.longitude),
          fetchTrails(),
        ]);
      } catch {
        if (mounted) setGpsAvailable(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fetchPois, fetchTrails]);

  // -----------------------------------------------------------------------
  // Map region change → reload POIs (Req 10.2)
  // -----------------------------------------------------------------------
  const onRegionChangeComplete = useCallback(
    (newRegion: Region) => {
      setRegion(newRegion);
      fetchPois(newRegion.latitude, newRegion.longitude);
    },
    [fetchPois],
  );

  // -----------------------------------------------------------------------
  // Compute distance from user to a POI
  // -----------------------------------------------------------------------
  const distanceToPoi = (poi: POI): number | null => {
    if (!userPosition) return null;
    return calculateDistance(
      { latitude: userPosition.latitude, longitude: userPosition.longitude },
      { latitude: poi.latitude, longitude: poi.longitude },
    );
  };

  // -----------------------------------------------------------------------
  // Mint POI (Req 10.5)
  // -----------------------------------------------------------------------
  const handleMint = useCallback(async () => {
    if (!userPosition) {
      Alert.alert('GPS Required', 'Enable location services to mint a POI.');
      return;
    }
    setActionLoading(true);
    try {
      const result = await apiClient.mintPoi(
        `POI-${Date.now()}`,
        userPosition.latitude,
        userPosition.longitude,
      );
      Alert.alert('POI Minted!', `"${result.name}" created as ${result.rarity}.`);
      // Refresh markers
      await fetchPois(region.latitude, region.longitude);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mint failed';
      Alert.alert('Mint Failed', message);
    } finally {
      setActionLoading(false);
    }
  }, [userPosition, region, fetchPois]);

  // -----------------------------------------------------------------------
  // Check-in at selected POI (Req 11.3, 11.4, 11.6)
  // -----------------------------------------------------------------------
  const handleCheckin = useCallback(async () => {
    if (!selectedPoi) return;

    if (!userPosition) {
      Alert.alert('GPS Required', 'Enable location services to check in.');
      return;
    }

    const verification = verifyProximity(userPosition, {
      latitude: selectedPoi.latitude,
      longitude: selectedPoi.longitude,
    });

    if (verification.accuracyWarning) {
      Alert.alert(
        'Weak GPS Signal',
        'Your GPS accuracy is low — the check-in may be rejected by the server.',
      );
    }

    if (!verification.allowed) {
      Alert.alert(
        'Too Far Away',
        `You are ${Math.round(verification.distance)}m from this POI. You need to be within 200m to check in.`,
      );
      return;
    }

    setActionLoading(true);
    try {
      const payload = await buildCheckinPayload(selectedPoi.id, userPosition);
      const result = await apiClient.checkin(payload);
      Alert.alert('Checked In!', result.message);
      setSelectedPoi(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Check-in failed';
      Alert.alert('Check-in Failed', message);
    } finally {
      setActionLoading(false);
    }
  }, [selectedPoi, userPosition]);

  const handleRefreshNearby = useCallback(async () => {
    setActionLoading(true);
    try {
      const lat = userPosition?.latitude ?? region.latitude;
      const lon = userPosition?.longitude ?? region.longitude;
      await Promise.all([fetchPois(lat, lon), fetchTrails()]);
      if (userPosition) {
        setRegion((current) => ({
          ...current,
          latitude: userPosition.latitude,
          longitude: userPosition.longitude,
        }));
      }
    } catch {
      Alert.alert('Refresh Failed', 'Unable to refresh nearby POIs right now.');
    } finally {
      setActionLoading(false);
    }
  }, [fetchPois, fetchTrails, region.latitude, region.longitude, userPosition]);

  const handleDownloadTrail = useCallback(async (trail: RouteSummary) => {
    try {
      const fullTrail = trail.route_points?.length ? trail : await apiClient.getRouteById(trail.id);
      await saveDownloadedTrail(fullTrail);
      setDownloadedTrailIds((prev) => (prev.includes(trail.id) ? prev : [...prev, trail.id]));
      Alert.alert('Trail saved offline', 'Route line and POIs are now stored on your device.');
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'Could not save this trail yet.');
    }
  }, []);

  // -----------------------------------------------------------------------
  // GPS unavailable prompt (Req 10.6)
  // -----------------------------------------------------------------------
  if (!gpsAvailable && !loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.gpsPromptTitle}>Location Services Required</Text>
        <Text style={styles.gpsPromptText}>
          Enable location services to explore nearby POIs on the map.
        </Text>
        <TouchableOpacity
          style={styles.enableButton}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Location.requestForegroundPermissionsAsync();
            } else {
              Location.requestForegroundPermissionsAsync();
            }
          }}
        >
          <Text style={styles.enableButtonText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Detail card for selected POI (Req 10.4)
  // -----------------------------------------------------------------------
  const renderDetailCard = () => {
    if (!selectedPoi) return null;

    const dist = distanceToPoi(selectedPoi);
    const distLabel =
      dist !== null
        ? dist >= 1000
          ? `${(dist / 1000).toFixed(1)} km away`
          : `${Math.round(dist)}m away`
        : 'Distance unknown';

    return (
      <View style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <Text style={styles.detailName}>{selectedPoi.name}</Text>
          <View
            style={[
              styles.rarityBadge,
              { backgroundColor: getRarityColor(selectedPoi.rarity) },
            ]}
          >
            <Text style={styles.rarityBadgeText}>{selectedPoi.rarity}</Text>
          </View>
        </View>

        <Text style={styles.detailDistance}>{distLabel}</Text>

        {selectedPoi.description ? (
          <Text style={styles.detailDescription}>{selectedPoi.description}</Text>
        ) : null}

        <View style={styles.detailActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.checkinButton]}
            onPress={handleCheckin}
            disabled={actionLoading}
          >
            <Text style={styles.actionButtonText}>
              {actionLoading ? 'Processing…' : 'Check In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedPoi(null)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTrailPanel = (embedded = false) => {
    if (trails.length === 0) return null;

    return (
      <View style={[styles.trailPanel, embedded && styles.trailPanelEmbedded]}>
        <Text style={styles.trailPanelEyebrow}>Trail discovery</Text>
        <Text style={styles.trailPanelTitle}>Run and save trails with low battery use</Text>
        {trails.map((trail) => {
          const isDownloaded = downloadedTrailIds.includes(trail.id);
          return (
            <View key={trail.id} style={styles.trailCard}>
              <View style={styles.trailCardHeader}>
                <Text style={styles.trailCardTitle}>{trail.name}</Text>
                <Text style={styles.trailCardBadge}>{trail.build_mode || 'manual'}</Text>
              </View>
              <Text style={styles.trailCardMeta}>
                {trail.distance_km.toFixed(1)} km · {trail.poi_count || 0} POIs · {trail.is_minted ? 'Minted' : 'Open'}
              </Text>
              <View style={styles.trailActionRow}>
                <TouchableOpacity style={[styles.trailActionButton, styles.trailRunButton]} onPress={() => router.push({ pathname: '/trail-run', params: { routeId: trail.id } })}>
                  <Text style={styles.trailActionText}>Start Trail Run</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.trailActionButton, isDownloaded ? styles.trailSavedButton : styles.trailDownloadButton]} onPress={() => handleDownloadTrail(trail)}>
                  <Text style={styles.trailActionText}>{isDownloaded ? 'Saved Offline' : 'Download Map'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderWebFallback = () => (
    <View style={styles.webContainer}>
      <View style={styles.webHeader}>
        <Text style={styles.webTitle}>POIs near your current area</Text>
        <Text style={styles.webSubtitle}>
          Interactive native maps are only enabled on iOS and Android. On web, you can still browse nearby POIs and mint/check in.
        </Text>
        <View style={styles.webStatsRow}>
          <View style={styles.webStatCard}>
            <Text style={styles.webStatLabel}>Nearby POIs</Text>
            <Text style={styles.webStatValue}>{pois.length}</Text>
          </View>
          <View style={styles.webStatCard}>
            <Text style={styles.webStatLabel}>Center</Text>
            <Text style={styles.webStatValueSmall}>
              {formatCoordinate(region.latitude)}, {formatCoordinate(region.longitude)}
            </Text>
          </View>
          <View style={styles.webStatCard}>
            <Text style={styles.webStatLabel}>GPS</Text>
            <Text style={styles.webStatValueSmall}>
              {userPosition ? 'Live' : 'Fallback'}
            </Text>
          </View>
        </View>
        <View style={styles.webActionsRow}>
          <TouchableOpacity
            style={[styles.webActionButton, styles.webRefreshButton]}
            onPress={handleRefreshNearby}
            disabled={actionLoading}
          >
            <Text style={styles.webRefreshButtonText}>
              {actionLoading ? 'Refreshing…' : 'Refresh Nearby'}
            </Text>
          </TouchableOpacity>
          {userPosition ? (
            <View style={styles.webLocationChip}>
              <Text style={styles.webLocationChipText}>
                You: {formatCoordinate(userPosition.latitude)}, {formatCoordinate(userPosition.longitude)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.webList}>
        {renderTrailPanel(true)}
        {pois.length === 0 ? (
          <View style={styles.webEmptyState}>
            <Text style={styles.webEmptyTitle}>No POIs found</Text>
            <Text style={styles.webEmptyText}>Try moving to another area or mint a new POI.</Text>
          </View>
        ) : (
          pois.map((poi) => {
            const dist = distanceToPoi(poi);
            const distLabel =
              dist !== null
                ? dist >= 1000
                  ? `${(dist / 1000).toFixed(1)} km away`
                  : `${Math.round(dist)}m away`
                : 'Distance unknown';

            return (
              <TouchableOpacity
                key={poi.id}
                style={styles.poiCard}
                onPress={() => setSelectedPoi(poi)}
              >
                <View style={styles.poiCardHeader}>
                  <Text style={styles.poiCardTitle}>{poi.name}</Text>
                  <View
                    style={[
                      styles.rarityBadge,
                      { backgroundColor: getRarityColor(poi.rarity) },
                    ]}
                  >
                    <Text style={styles.rarityBadgeText}>{poi.rarity}</Text>
                  </View>
                </View>
                <Text style={styles.poiCardDistance}>{distLabel}</Text>
                {poi.description ? (
                  <Text style={styles.poiCardDescription}>{poi.description}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        {selectedPoi ? (
          <View style={styles.webSelectionCard}>
            <Text style={styles.webSelectionEyebrow}>Selected POI</Text>
            <View style={styles.poiCardHeader}>
              <Text style={styles.poiCardTitle}>{selectedPoi.name}</Text>
              <View
                style={[
                  styles.rarityBadge,
                  { backgroundColor: getRarityColor(selectedPoi.rarity) },
                ]}
              >
                <Text style={styles.rarityBadgeText}>{selectedPoi.rarity}</Text>
              </View>
            </View>
            <Text style={styles.poiCardDistance}>
              {formatCoordinate(selectedPoi.latitude)}, {formatCoordinate(selectedPoi.longitude)}
            </Text>
            {selectedPoi.description ? (
              <Text style={styles.poiCardDescription}>{selectedPoi.description}</Text>
            ) : null}
            <View style={styles.detailActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.checkinButton]}
                onPress={handleCheckin}
                disabled={actionLoading}
              >
                <Text style={styles.actionButtonText}>
                  {actionLoading ? 'Processing…' : 'Check In'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedPoi(null)}
              >
                <Text style={styles.closeButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  // -----------------------------------------------------------------------
  // Main render — map + markers + detail card + mint button
  // -----------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        renderWebFallback()
      ) : (
        <PoiMap
          mapRef={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
          pois={pois}
          getRarityColor={getRarityColor}
          onSelectPoi={setSelectedPoi}
        />
      )}

      {/* Mint POI floating button */}
      <TouchableOpacity
        style={styles.mintButton}
        onPress={handleMint}
        disabled={actionLoading}
      >
        <Text style={styles.mintButtonText}>
          {actionLoading ? '…' : '+ Mint POI'}
        </Text>
      </TouchableOpacity>

      {/* Trail discovery panel */}
      {!selectedPoi ? renderTrailPanel() : null}

      {/* Selected POI detail card */}
      {renderDetailCard()}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  webHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#d1fae5',
  },
  webTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#14532d',
    marginBottom: 6,
  },
  webSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#166534',
  },
  webStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  webStatCard: {
    backgroundColor: '#ffffffcc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    minWidth: 110,
  },
  webStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#15803d',
    marginBottom: 6,
  },
  webStatValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14532d',
  },
  webStatValueSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14532d',
  },
  webActionsRow: {
    marginTop: 14,
    gap: 10,
  },
  webActionButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  webRefreshButton: {
    backgroundColor: '#166534',
  },
  webRefreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  webLocationChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webLocationChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  webList: {
    padding: 16,
    gap: 12,
  },
  webEmptyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  webEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  webEmptyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  poiCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  poiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  poiCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginRight: 8,
  },
  poiCardDistance: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  poiCardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  webSelectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  webSelectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  // GPS unavailable prompt
  gpsPromptTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 8,
    textAlign: 'center',
  },
  gpsPromptText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  enableButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  enableButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Mint POI floating button
  mintButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#15803d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  mintButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  // Detail card
  detailCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  trailPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
    maxHeight: 300,
  },
  trailPanelEmbedded: {
    position: 'relative',
    left: undefined,
    right: undefined,
    bottom: undefined,
    marginBottom: 12,
    maxHeight: undefined,
  },
  trailPanelEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  trailPanelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  trailCard: {
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    padding: 12,
    marginTop: 8,
  },
  trailCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trailCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginRight: 8,
  },
  trailCardBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
    textTransform: 'capitalize',
    fontSize: 11,
  },
  trailCardMeta: {
    color: '#64748b',
    marginTop: 4,
    fontSize: 12,
  },
  trailActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  trailActionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  trailRunButton: {
    backgroundColor: '#10b981',
  },
  trailDownloadButton: {
    backgroundColor: '#1d4ed8',
  },
  trailSavedButton: {
    backgroundColor: '#0f172a',
  },
  trailActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  rarityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  rarityBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  detailDistance: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  detailDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    marginBottom: 12,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  checkinButton: {
    backgroundColor: '#22c55e',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 14,
  },
});
