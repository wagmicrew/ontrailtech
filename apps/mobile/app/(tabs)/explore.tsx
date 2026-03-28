import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';

import { apiClient } from '../../lib/apiClient';
import {
  calculateDistance,
  verifyProximity,
  buildCheckinPayload,
  getCurrentPosition,
} from '../../lib/gpsVerifier';
import { POI_NEARBY_RADIUS_KM } from '../../lib/constants';
import type { POI, GPSPosition } from '../../lib/types';

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

export default function ExploreScreen() {
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userPosition, setUserPosition] = useState<GPSPosition | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
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
        await fetchPois(pos.latitude, pos.longitude);
      } catch {
        if (mounted) setGpsAvailable(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fetchPois]);

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

  // -----------------------------------------------------------------------
  // Main render — map + markers + detail card + mint button
  // -----------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton
      >
        {pois.map((poi) => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
            pinColor={getRarityColor(poi.rarity)}
            onPress={() => setSelectedPoi(poi)}
          />
        ))}
      </MapView>

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
