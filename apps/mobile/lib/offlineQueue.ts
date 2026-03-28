/**
 * Offline request queue for the OnTrail Expo companion app.
 *
 * Persists queued requests to AsyncStorage and replays them in FIFO order
 * (earliest createdAt first) when network connectivity is restored.
 * Failed requests retry up to 3 times with exponential backoff (1s, 2s, 4s)
 * before being discarded with a user notification.
 *
 * Requirements: 13.3, 13.4, 13.5
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import {
  STORAGE_KEYS,
  OFFLINE_QUEUE_MAX_RETRIES,
  OFFLINE_QUEUE_BASE_BACKOFF_MS,
} from './constants';
import { request } from './apiClient';
import type { QueuedRequest } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read the current queue from AsyncStorage. Returns [] on any error. */
async function readQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the queue array to AsyncStorage. */
async function writeQueue(queue: QueuedRequest[]): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.OFFLINE_QUEUE,
    JSON.stringify(queue),
  );
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Guard against concurrent processQueue runs
// ---------------------------------------------------------------------------
let _processing = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a request to the offline queue (FIFO).
 * The request is persisted immediately to AsyncStorage.
 */
export async function enqueue(req: QueuedRequest): Promise<void> {
  const queue = await readQueue();
  queue.push(req);
  await writeQueue(queue);
}

/**
 * Process all queued requests in createdAt order (FIFO).
 *
 * For each request:
 *  1. Attempt to replay via the API client `request()` function.
 *  2. On success → remove from queue.
 *  3. On failure → increment retryCount, apply exponential backoff, retry.
 *  4. After OFFLINE_QUEUE_MAX_RETRIES failures → discard and warn.
 */
export async function processQueue(): Promise<void> {
  if (_processing) return;
  _processing = true;

  try {
    let queue = await readQueue();
    if (queue.length === 0) return;

    // Sort by createdAt ascending (FIFO — earliest first)
    queue.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const remaining: QueuedRequest[] = [];

    for (const item of queue) {
      let success = false;
      let retries = item.retryCount;

      while (retries < OFFLINE_QUEUE_MAX_RETRIES) {
        try {
          await request(item.path, {
            method: item.method,
            ...(item.body ? { body: item.body } : {}),
          });
          success = true;
          break;
        } catch {
          retries += 1;
          if (retries < OFFLINE_QUEUE_MAX_RETRIES) {
            // Exponential backoff: 1s, 2s, 4s (base * 2^attempt)
            const delay =
              OFFLINE_QUEUE_BASE_BACKOFF_MS * Math.pow(2, retries - 1);
            await sleep(delay);
          }
        }
      }

      if (!success) {
        // Discard after max retries and notify user
        console.warn(
          `[OfflineQueue] Discarding request after ${OFFLINE_QUEUE_MAX_RETRIES} failures: ${item.method} ${item.path} (id: ${item.id})`,
        );
        // Item is NOT added to remaining — effectively discarded
      } else {
        // Successfully processed — do not re-add
      }
    }

    // Write back only items that were not processed in this run
    // (in this implementation all items are attempted, so remaining is empty
    //  unless we add partial-processing logic later)
    await writeQueue(remaining);
  } finally {
    _processing = false;
  }
}

/**
 * Return the number of requests currently in the offline queue.
 */
export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

// ---------------------------------------------------------------------------
// NetInfo listener — auto-process queue on connectivity restore
// ---------------------------------------------------------------------------
let _unsubscribe: (() => void) | null = null;

/**
 * Start listening for connectivity changes.
 * When the device regains connectivity, the queue is processed automatically.
 */
export function startNetInfoListener(): void {
  if (_unsubscribe) return; // already listening

  _unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      processQueue();
    }
  });
}

/**
 * Stop listening for connectivity changes.
 */
export function stopNetInfoListener(): void {
  _unsubscribe?.();
  _unsubscribe = null;
}
