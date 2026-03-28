/**
 * Step Tracker module for the OnTrail Expo companion app.
 *
 * Uses expo-sensors Pedometer API to read device step counts and syncs
 * accumulated steps to the backend at a configurable interval (default 15 min,
 * bounded 5–30 min). On foreground resume, queries the pedometer for the
 * background gap and syncs immediately.
 */
import { Pedometer } from 'expo-sensors';
import { AppState, type AppStateStatus } from 'react-native';

import { apiClient } from './apiClient';
import {
  STEP_SYNC_INTERVAL_MS,
  STEP_SYNC_MIN_MS,
  STEP_SYNC_MAX_MS,
} from './constants';
import type { StepSyncPayload } from './types';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Whether the device pedometer is available */
let _available: boolean | null = null;

/** Pedometer subscription for live step updates */
let _subscription: ReturnType<typeof Pedometer.watchStepCount> | null = null;

/** Periodic sync timer handle */
let _syncTimer: ReturnType<typeof setInterval> | null = null;

/** AppState change listener subscription */
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/** Timestamp of the last successful sync (epoch ms) */
let _lastSyncTime: number = 0;

/** Timestamp when tracking started (epoch ms) */
let _trackingStartTime: number = 0;

/** Whether tracking is currently active */
let _isTracking = false;

/** Current configured sync interval in ms */
let _syncIntervalMs: number = STEP_SYNC_INTERVAL_MS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the start-of-day Date for the current local day. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Clamp a sync interval to the allowed range [5 min, 30 min].
 */
export function clampSyncInterval(ms: number): number {
  return Math.min(STEP_SYNC_MAX_MS, Math.max(STEP_SYNC_MIN_MS, ms));
}

/**
 * Build a StepSyncPayload from a step count and time window.
 */
function buildPayload(steps: number, periodStart: Date, periodEnd: Date): StepSyncPayload {
  return {
    steps,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    source: 'pedometer',
  };
}

/**
 * Sync steps for the period since the last sync (or tracking start).
 * Silently swallows errors so the tracker keeps running.
 */
async function syncNow(): Promise<void> {
  const periodStart = new Date(_lastSyncTime || _trackingStartTime);
  const periodEnd = new Date();

  try {
    const steps = await getStepsSince(periodStart);
    if (steps > 0) {
      const payload = buildPayload(steps, periodStart, periodEnd);
      await apiClient.syncSteps(payload);
    }
    _lastSyncTime = periodEnd.getTime();
  } catch {
    // Sync failed — will retry on next interval or foreground resume.
  }
}

// ---------------------------------------------------------------------------
// AppState handler — foreground resume
// ---------------------------------------------------------------------------

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active' && _isTracking) {
    // App returned to foreground — query pedometer for background gap and sync
    syncNow();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the device has a pedometer sensor.
 * Caches the result after the first call.
 */
export async function isAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    _available = await Pedometer.isAvailableAsync();
  } catch {
    _available = false;
  }
  return _available;
}

/**
 * Request motion/pedometer permission from the user.
 * Returns `true` if permission was granted.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const result = await Pedometer.requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

/**
 * Start periodic step tracking and syncing.
 *
 * @param syncIntervalMs  Optional custom sync interval in ms.
 *                        Will be clamped to [5 min, 30 min].
 */
export function startTracking(syncIntervalMs?: number): void {
  if (_isTracking) return;

  _isTracking = true;
  _trackingStartTime = Date.now();
  _lastSyncTime = _trackingStartTime;

  // Apply (and clamp) custom interval if provided
  _syncIntervalMs = clampSyncInterval(syncIntervalMs ?? STEP_SYNC_INTERVAL_MS);

  // Subscribe to live step count updates (keeps pedometer active)
  _subscription = Pedometer.watchStepCount(() => {
    // We don't need to act on every step — syncing happens on the timer.
  });

  // Periodic sync timer
  _syncTimer = setInterval(syncNow, _syncIntervalMs);

  // Listen for foreground resume
  _appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

/**
 * Stop step tracking and tear down all listeners / timers.
 */
export function stopTracking(): void {
  if (!_isTracking) return;

  _isTracking = false;

  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }

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
 * Get the total step count for the current calendar day.
 */
export async function getCurrentDaySteps(): Promise<number> {
  const start = startOfToday();
  const end = new Date();
  try {
    const result = await Pedometer.getStepCountAsync(start, end);
    return result.steps;
  } catch {
    return 0;
  }
}

/**
 * Get the step count accumulated since the given date.
 */
export async function getStepsSince(date: Date): Promise<number> {
  const end = new Date();
  try {
    const result = await Pedometer.getStepCountAsync(date, end);
    return result.steps;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Convenience re-export for UI: is the tracker currently running?
// ---------------------------------------------------------------------------

/** Returns whether step tracking is currently active. */
export function isTracking(): boolean {
  return _isTracking;
}

/** Returns the current sync interval in ms. */
export function getSyncIntervalMs(): number {
  return _syncIntervalMs;
}
