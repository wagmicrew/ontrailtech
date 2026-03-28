/**
 * Cached API layer for the OnTrail Expo companion app.
 *
 * Wraps apiClient methods with AsyncStorage caching so that:
 *  - Profile, nearby POIs, and step count are cached after each successful fetch.
 *  - Cached data is served when the device is offline.
 *  - Mutable requests (step syncs, check-ins) are enqueued via offlineQueue when offline.
 *
 * Requirements: 13.1, 13.2, 13.3
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { STORAGE_KEYS } from './constants';
import { apiClient, request } from './apiClient';
import { enqueue } from './offlineQueue';
import type {
  AuthUser,
  POI,
  StepSyncPayload,
  CheckinPayload,
  QueuedRequest,
} from './types';

// ---------------------------------------------------------------------------
// Connectivity helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the device has network connectivity.
 */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable !== false);
}

// ---------------------------------------------------------------------------
// Cache readers
// ---------------------------------------------------------------------------

/** Read the cached runner profile from AsyncStorage. */
export async function getCachedProfile(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_PROFILE);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** Read the cached nearby POI list from AsyncStorage. */
export async function getCachedPois(): Promise<POI[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_POIS);
    return raw ? (JSON.parse(raw) as POI[]) : null;
  } catch {
    return null;
  }
}

/** Read the cached current-day step count from AsyncStorage. */
export async function getCachedSteps(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STEPS);
    return raw !== null ? (JSON.parse(raw) as number) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cached fetch wrappers
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user profile, cache the result, and return it.
 * When offline, returns the cached profile instead.
 */
export async function getMe(): Promise<AuthUser | null> {
  if (await isOnline()) {
    try {
      const profile = await apiClient.getMe();
      await AsyncStorage.setItem(
        STORAGE_KEYS.CACHED_PROFILE,
        JSON.stringify(profile),
      );
      return profile;
    } catch {
      // Network succeeded but request failed — fall through to cache
      return getCachedProfile();
    }
  }
  return getCachedProfile();
}

/**
 * Fetch nearby POIs, cache the result, and return it.
 * When offline, returns the cached POI list instead.
 */
export async function getNearbyPois(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<POI[] | null> {
  if (await isOnline()) {
    try {
      const pois = await apiClient.getNearbyPois(lat, lon, radiusKm);
      await AsyncStorage.setItem(
        STORAGE_KEYS.CACHED_POIS,
        JSON.stringify(pois),
      );
      return pois;
    } catch {
      return getCachedPois();
    }
  }
  return getCachedPois();
}

/**
 * Fetch the current day step count, cache the result, and return it.
 * When offline, returns the cached step count instead.
 *
 * Note: This calls GET /users/me and extracts `step_balance` as the
 * current day step count proxy. Adjust if a dedicated endpoint exists.
 */
export async function getCurrentDaySteps(): Promise<number | null> {
  if (await isOnline()) {
    try {
      const profile = await apiClient.getMe();
      const steps = profile.step_balance;
      await AsyncStorage.setItem(
        STORAGE_KEYS.CACHED_STEPS,
        JSON.stringify(steps),
      );
      return steps;
    } catch {
      return getCachedSteps();
    }
  }
  return getCachedSteps();
}

// ---------------------------------------------------------------------------
// Offline-aware mutating requests
// ---------------------------------------------------------------------------

/**
 * If online, execute the request directly via `apiClient`.
 * If offline, enqueue it for later replay via the offline queue.
 *
 * @param path   API path (e.g. `/steps/sync`)
 * @param method HTTP method
 * @param body   Serialised JSON body
 * @param directFn  Optional function to call directly when online
 */
export async function enqueueIfOffline<T>(
  path: string,
  method: string,
  body: string,
  directFn?: () => Promise<T>,
): Promise<T | void> {
  if (await isOnline()) {
    if (directFn) {
      return directFn();
    }
    // Fallback: use the raw request helper from apiClient
    return request<T>(path, { method, body });
  }

  // Offline → enqueue
  const queued: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    path,
    method,
    body,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  await enqueue(queued);
}

// ---------------------------------------------------------------------------
// Convenience wrappers for common mutable operations
// ---------------------------------------------------------------------------

/** Sync steps — online: direct call, offline: enqueue. */
export async function syncSteps(payload: StepSyncPayload): Promise<void> {
  await enqueueIfOffline(
    '/steps/sync',
    'POST',
    JSON.stringify(payload),
    () => apiClient.syncSteps(payload),
  );
}

/** Check in at a POI — online: direct call, offline: enqueue. */
export async function checkin(
  data: CheckinPayload,
): Promise<void> {
  await enqueueIfOffline(
    '/route/checkin',
    'POST',
    JSON.stringify(data),
    () => apiClient.checkin(data).then(() => undefined),
  );
}
