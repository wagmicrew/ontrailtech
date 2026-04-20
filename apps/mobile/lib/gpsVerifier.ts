/**
 * GPS Verifier module for the OnTrail Expo companion app.
 *
 * Provides:
 *   - High-accuracy GPS position retrieval via expo-location
 *   - Haversine great-circle distance calculation
 *   - Proximity gate for POI check-in (≤ 200 m)
 *   - Check-in payload construction with optional device attestation
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
import * as Location from 'expo-location';

import {
  PROXIMITY_MAX_DISTANCE_M,
  GPS_ACCURACY_WARNING_THRESHOLD_M,
} from './constants';
import { getAttestationToken } from './deviceAttestation';
import type { GPSPosition, VerifyResult, CheckinPayload } from './types';

/** Minimal coordinate pair used by the Haversine function. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Earth's mean radius in meters. */
const EARTH_RADIUS_M = 6_371_000;

// ---------------------------------------------------------------------------
// GPS position
// ---------------------------------------------------------------------------

/**
 * Obtain the device's current GPS position.
 *
 * @param highAccuracy - When `true`, requests `Accuracy.High` from
 *   expo-location for the best available fix.
 * @returns A {@link GPSPosition} with latitude, longitude, accuracy (m) and
 *   a Unix-epoch timestamp.
 */
export async function getCurrentPosition(
  highAccuracy: boolean,
): Promise<GPSPosition> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: highAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 0,
    timestamp: location.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

/**
 * Calculate the great-circle distance between two coordinates using the
 * Haversine formula.
 *
 * @returns Distance in **meters**.
 */
export function calculateDistance(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLon = Math.sin(dLon / 2);

  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      sinHalfDLon *
      sinHalfDLon;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Proximity verification
// ---------------------------------------------------------------------------

/**
 * Verify whether the user is close enough to a POI for check-in.
 *
 * @param userPos  - The user's current GPS reading.
 * @param poiPos   - The POI's coordinates.
 * @param maxDistance - Maximum allowed distance in meters (default 200 m).
 * @returns A {@link VerifyResult} indicating whether check-in is allowed,
 *   the computed distance, and whether a GPS accuracy warning applies.
 */
export function verifyProximity(
  userPos: GPSPosition,
  poiPos: Coordinates,
  maxDistance: number = PROXIMITY_MAX_DISTANCE_M,
): VerifyResult {
  const distance = calculateDistance(
    { latitude: userPos.latitude, longitude: userPos.longitude },
    poiPos,
  );

  return {
    allowed: distance <= maxDistance,
    distance,
    accuracyWarning: userPos.accuracy > GPS_ACCURACY_WARNING_THRESHOLD_M,
  };
}

// ---------------------------------------------------------------------------
// Check-in payload builder
// ---------------------------------------------------------------------------

/**
 * Build a {@link CheckinPayload} for `POST /route/checkin`.
 *
 * Includes the device attestation token when available; omits the field
 * otherwise so the backend can apply reduced trust scoring.
 *
 * @param poiId   - The POI identifier.
 * @param userPos - The user's current GPS reading.
 * @returns A fully populated check-in payload ready for submission.
 */
export async function buildCheckinPayload(
  poiId: string,
  userPos: GPSPosition,
  sessionId?: string,
): Promise<CheckinPayload> {
  const attestationToken = await getAttestationToken();

  const payload: CheckinPayload = {
    poi_id: poiId,
    session_id: sessionId,
    latitude: userPos.latitude,
    longitude: userPos.longitude,
    accuracy: userPos.accuracy,
    timestamp: new Date(userPos.timestamp).toISOString(),
  };

  if (attestationToken) {
    payload.attestation_token = attestationToken;
  }

  return payload;
}
