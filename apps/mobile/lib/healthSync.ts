/**
 * Health Sync module for the OnTrail Expo companion app.
 *
 * Reads health data (steps, distance, calories) from Apple Health (iOS) or
 * Google Fit (Android) and syncs to the backend once per hour while
 * foregrounded. If health permissions are denied, the app continues with
 * pedometer-only step counting and surfaces a settings prompt flag.
 *
 * Uses dynamic requires with try/catch for graceful degradation when native
 * health modules are unavailable (e.g. Expo Go, simulators).
 */
import { Platform, AppState, type AppStateStatus } from 'react-native';

import { apiClient } from './apiClient';
import { HEALTH_SYNC_INTERVAL_MS } from './constants';
import type { HealthSyncPayload } from './types';

// ---------------------------------------------------------------------------
// Dynamic native module loading — graceful degradation
// ---------------------------------------------------------------------------

let AppleHealthKit: any = null;
let GoogleFit: any = null;

try {
  if (Platform.OS === 'ios') {
    AppleHealthKit = require('react-native-health').default;
  }
} catch {
  // react-native-health not available — health sync disabled on iOS
}

try {
  if (Platform.OS === 'android') {
    GoogleFit = require('react-native-google-fit').default;
  }
} catch {
  // react-native-google-fit not available — health sync disabled on Android
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Whether health APIs are available on this device/platform */
let _available: boolean | null = null;

/** Whether the user has granted health permissions */
let _permissionsGranted = false;

/** Periodic sync timer handle */
let _syncTimer: ReturnType<typeof setInterval> | null = null;

/** AppState change listener subscription */
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/** Timestamp of the last successful sync (epoch ms) */
let _lastSyncTime = 0;

/** Whether syncing is currently active */
let _isSyncing = false;

/** Flag for UI: true when permissions were denied and user should be prompted */
let _permissionsDenied = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the start-of-day Date for the current local day. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Determine the source label for the current platform. */
function getSource(): HealthSyncPayload['source'] {
  return Platform.OS === 'ios' ? 'apple_health' : 'google_fit';
}

// ---------------------------------------------------------------------------
// Platform-specific: Apple Health (iOS)
// ---------------------------------------------------------------------------

/**
 * Initialise Apple HealthKit and request read permissions for steps,
 * distance walking/running, and active energy burned.
 */
function initAppleHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!AppleHealthKit) {
      resolve(false);
      return;
    }

    const permissions = {
      permissions: {
        read: [
          AppleHealthKit.Constants?.Permissions?.StepCount ?? 'StepCount',
          AppleHealthKit.Constants?.Permissions?.DistanceWalkingRunning ?? 'DistanceWalkingRunning',
          AppleHealthKit.Constants?.Permissions?.ActiveEnergyBurned ?? 'ActiveEnergyBurned',
        ],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(permissions, (err: any) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

/** Read today's step count from Apple Health. */
function readAppleSteps(): Promise<number> {
  return new Promise((resolve) => {
    if (!AppleHealthKit) { resolve(0); return; }
    const options = { date: new Date().toISOString() };
    AppleHealthKit.getStepCount(options, (err: any, results: any) => {
      if (err || !results) { resolve(0); return; }
      resolve(results.value ?? 0);
    });
  });
}

/** Read today's walking/running distance (meters) from Apple Health. */
function readAppleDistance(): Promise<number> {
  return new Promise((resolve) => {
    if (!AppleHealthKit) { resolve(0); return; }
    const options = {
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
    };
    AppleHealthKit.getDailyDistanceWalkingRunningSamples(options, (err: any, results: any) => {
      if (err || !results || !Array.isArray(results)) { resolve(0); return; }
      const total = results.reduce((sum: number, r: any) => sum + (r.value ?? 0), 0);
      // Apple Health returns distance in meters
      resolve(total);
    });
  });
}

/** Read today's active energy burned (kcal) from Apple Health. */
function readAppleCalories(): Promise<number> {
  return new Promise((resolve) => {
    if (!AppleHealthKit) { resolve(0); return; }
    const options = {
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
    };
    AppleHealthKit.getActiveEnergyBurned(options, (err: any, results: any) => {
      if (err || !results || !Array.isArray(results)) { resolve(0); return; }
      const total = results.reduce((sum: number, r: any) => sum + (r.value ?? 0), 0);
      resolve(total);
    });
  });
}

// ---------------------------------------------------------------------------
// Platform-specific: Google Fit (Android)
// ---------------------------------------------------------------------------

/** Authorise Google Fit and request read permissions. */
async function initGoogleFit(): Promise<boolean> {
  if (!GoogleFit) return false;
  try {
    const options = { scopes: ['FITNESS_ACTIVITY_READ'] };
    const result = await GoogleFit.authorize(options);
    return result?.success === true;
  } catch {
    return false;
  }
}

/** Read today's step count from Google Fit. */
async function readGoogleSteps(): Promise<number> {
  if (!GoogleFit) return 0;
  try {
    const options = {
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
    };
    const results = await GoogleFit.getDailyStepCountSamples(options);
    if (!Array.isArray(results)) return 0;
    // Prefer "estimated_steps" source
    const estimated = results.find((r: any) => r.source === 'com.google.android.gms:estimated_steps');
    const steps = estimated?.steps ?? results[0]?.steps;
    if (Array.isArray(steps) && steps.length > 0) {
      return steps.reduce((sum: number, s: any) => sum + (s.value ?? 0), 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Read today's distance (meters) from Google Fit. */
async function readGoogleDistance(): Promise<number> {
  if (!GoogleFit) return 0;
  try {
    const options = {
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
    };
    const results = await GoogleFit.getDailyDistanceSamples(options);
    if (!Array.isArray(results) || results.length === 0) return 0;
    return results.reduce((sum: number, r: any) => sum + (r.distance ?? 0), 0);
  } catch {
    return 0;
  }
}

/** Read today's calories burned from Google Fit. */
async function readGoogleCalories(): Promise<number> {
  if (!GoogleFit) return 0;
  try {
    const options = {
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
    };
    const results = await GoogleFit.getDailyCalorieSamples(options);
    if (!Array.isArray(results) || results.length === 0) return 0;
    return results.reduce((sum: number, r: any) => sum + (r.calorie ?? 0), 0);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// AppState handler — foreground resume
// ---------------------------------------------------------------------------

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active' && _isSyncing && _permissionsGranted) {
    // App returned to foreground — check if enough time has passed and sync
    const elapsed = Date.now() - _lastSyncTime;
    if (elapsed >= HEALTH_SYNC_INTERVAL_MS) {
      syncNow();
    }
  }
}

/**
 * Perform a single health data sync. Reads today's data and submits to the
 * backend. Silently swallows errors so the sync loop keeps running.
 */
async function syncNow(): Promise<void> {
  try {
    const payload = await readTodayData();
    await apiClient.syncHealth(payload);
    _lastSyncTime = Date.now();
  } catch {
    // Sync failed — will retry on next interval or foreground resume.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether health APIs (Apple Health / Google Fit) are available on
 * this device. Caches the result after the first call.
 */
export async function isAvailable(): Promise<boolean> {
  if (_available !== null) return _available;

  if (Platform.OS === 'ios') {
    _available = AppleHealthKit != null;
  } else if (Platform.OS === 'android') {
    _available = GoogleFit != null;
  } else {
    _available = false;
  }

  return _available;
}

/**
 * Request health data read permissions from the user.
 * Returns `true` if permissions were granted.
 *
 * On denial, sets an internal flag so the UI can prompt the user to enable
 * health sync in Settings. The app continues with pedometer-only steps.
 */
export async function requestPermissions(): Promise<boolean> {
  let granted = false;

  if (Platform.OS === 'ios') {
    granted = await initAppleHealth();
  } else if (Platform.OS === 'android') {
    granted = await initGoogleFit();
  }

  _permissionsGranted = granted;
  _permissionsDenied = !granted;

  return granted;
}

/**
 * Read today's health data (steps, distance, calories) from the platform
 * health store and return a ready-to-submit payload.
 */
export async function readTodayData(): Promise<HealthSyncPayload> {
  let steps = 0;
  let distance = 0;
  let calories = 0;

  if (Platform.OS === 'ios') {
    [steps, distance, calories] = await Promise.all([
      readAppleSteps(),
      readAppleDistance(),
      readAppleCalories(),
    ]);
  } else if (Platform.OS === 'android') {
    [steps, distance, calories] = await Promise.all([
      readGoogleSteps(),
      readGoogleDistance(),
      readGoogleCalories(),
    ]);
  }

  return {
    steps,
    distance_meters: distance,
    calories_burned: calories,
    period_start: startOfToday().toISOString(),
    period_end: new Date().toISOString(),
    source: getSource(),
  };
}

/**
 * Start the periodic health sync loop. Syncs once per hour
 * (HEALTH_SYNC_INTERVAL_MS) while the app is foregrounded.
 *
 * No-op if permissions have not been granted or sync is already running.
 */
export function startSync(): void {
  if (_isSyncing) return;
  if (!_permissionsGranted) return;

  _isSyncing = true;
  _lastSyncTime = Date.now();

  // Perform an initial sync immediately
  syncNow();

  // Set up the hourly interval
  _syncTimer = setInterval(syncNow, HEALTH_SYNC_INTERVAL_MS);

  // Listen for foreground resume
  _appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

/**
 * Stop the periodic health sync loop and tear down listeners.
 */
export function stopSync(): void {
  if (!_isSyncing) return;

  _isSyncing = false;

  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }

  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
}

/**
 * Convenience wrapper: start the full sync lifecycle.
 * Checks availability, requests permissions, and starts the sync loop.
 * Returns `true` if health sync is active, `false` if unavailable or denied.
 */
export async function sync(): Promise<void> {
  const available = await isAvailable();
  if (!available) return;

  const granted = await requestPermissions();
  if (!granted) return;

  startSync();
}

// ---------------------------------------------------------------------------
// UI helper flags
// ---------------------------------------------------------------------------

/** Whether health sync is currently running. */
export function isSyncing(): boolean {
  return _isSyncing;
}

/** Whether the user denied health permissions (UI should show settings prompt). */
export function wasPermissionDenied(): boolean {
  return _permissionsDenied;
}

/** Whether health permissions have been granted. */
export function hasPermissions(): boolean {
  return _permissionsGranted;
}
