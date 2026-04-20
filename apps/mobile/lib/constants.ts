/**
 * App-wide constants for the OnTrail Expo companion app.
 */

/** Base URL for all API requests (HTTPS only) */
export const API_BASE_URL = 'https://api.ontrail.tech';

// ── SecureStore keys (AES-encrypted on device) ──────────────────────────

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'ontrail_access_token',
  REFRESH_TOKEN: 'ontrail_refresh_token',
} as const;

// ── AsyncStorage keys ───────────────────────────────────────────────────

export const STORAGE_KEYS = {
  OFFLINE_QUEUE: '@ontrail/offline_queue',
  CACHED_PROFILE: '@ontrail/cached_profile',
  CACHED_POIS: '@ontrail/cached_pois',
  CACHED_STEPS: '@ontrail/cached_steps',
  PUSH_TOKEN: '@ontrail/push_token',
  DOWNLOADED_TRAILS: '@ontrail/downloaded_trails',
  ACTIVE_TRAIL_RUN: '@ontrail/active_trail_run',
  LOCAL_TRAIL_DRAFTS: '@ontrail/local_trail_drafts',
} as const;

// ── Sync intervals (milliseconds) ──────────────────────────────────────

/** Default step sync interval: 15 minutes */
export const STEP_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** Minimum step sync interval: 5 minutes */
export const STEP_SYNC_MIN_MS = 5 * 60 * 1000;

/** Maximum step sync interval: 30 minutes */
export const STEP_SYNC_MAX_MS = 30 * 60 * 1000;

/** Health sync interval: 1 hour */
export const HEALTH_SYNC_INTERVAL_MS = 60 * 60 * 1000;

// ── Distance / GPS thresholds ──────────────────────────────────────────

/** Maximum distance (meters) for POI check-in proximity gate */
export const PROXIMITY_MAX_DISTANCE_M = 200;

/** GPS accuracy (meters) above which a warning is shown */
export const GPS_ACCURACY_WARNING_THRESHOLD_M = 100;

/** GPS accuracy (meters) threshold for high-accuracy readings */
export const GPS_HIGH_ACCURACY_THRESHOLD_M = 50;

/** Default radius (km) for nearby POI queries */
export const POI_NEARBY_RADIUS_KM = 10;

/** Battery-safe route tracking update interval while a trail run is active */
export const TRAIL_RUN_UPDATE_MS = 12 * 1000;

/** Minimum movement before the next trail update is processed */
export const TRAIL_RUN_DISTANCE_INTERVAL_M = 15;

/** Distance from the route line that triggers a guidance correction */
export const TRAIL_OFF_ROUTE_WARNING_M = 80;

/** Checkpoint auto-check radius while running a trail */
export const TRAIL_CHECKPOINT_RADIUS_M = 50;

// ── Offline queue ──────────────────────────────────────────────────────

/** Max retry attempts for queued offline requests */
export const OFFLINE_QUEUE_MAX_RETRIES = 3;

/** Base backoff delay (ms) for offline queue retries — doubles each attempt */
export const OFFLINE_QUEUE_BASE_BACKOFF_MS = 1000;
