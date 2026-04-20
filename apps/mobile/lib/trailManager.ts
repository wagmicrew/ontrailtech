import AsyncStorage from '@react-native-async-storage/async-storage';

import { calculateDistance } from './gpsVerifier';
import { STORAGE_KEYS } from './constants';
import type { GPSPosition, POI, RouteCheckpoint, RoutePoint, RouteSummary, CreateRoutePayload } from './types';

type StoredTrailMap = Record<string, RouteSummary>;
type StoredTrailDraftMap = Record<string, { route: RouteSummary; payload: CreateRoutePayload; saved_at: string }>;

async function readStoredTrailMap(): Promise<StoredTrailMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_TRAILS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredTrailMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStoredTrailMap(next: StoredTrailMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_TRAILS, JSON.stringify(next));
}

async function readStoredDraftMap(): Promise<StoredTrailDraftMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOCAL_TRAIL_DRAFTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredTrailDraftMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStoredDraftMap(next: StoredTrailDraftMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_TRAIL_DRAFTS, JSON.stringify(next));
}

export async function getDownloadedTrailIds(): Promise<string[]> {
  const stored = await readStoredTrailMap();
  return Object.keys(stored);
}

export async function getDownloadedTrail(routeId: string): Promise<RouteSummary | null> {
  const stored = await readStoredTrailMap();
  return stored[routeId] || null;
}

export async function saveDownloadedTrail(route: RouteSummary): Promise<void> {
  const stored = await readStoredTrailMap();
  stored[route.id] = {
    ...route,
    downloaded_at: new Date().toISOString(),
  };
  await writeStoredTrailMap(stored);
}

export async function saveLocalTrailDraft(route: RouteSummary, payload: CreateRoutePayload): Promise<void> {
  const stored = await readStoredDraftMap();
  stored[route.id] = {
    route: {
      ...route,
      local_only: true,
      sync_status: 'pending',
      downloaded_at: new Date().toISOString(),
    },
    payload,
    saved_at: new Date().toISOString(),
  };
  await writeStoredDraftMap(stored);
}

export async function getLocalTrailDrafts(): Promise<RouteSummary[]> {
  const stored = await readStoredDraftMap();
  return Object.values(stored)
    .map((entry) => entry.route)
    .sort((a, b) => {
      const aTime = new Date(a.downloaded_at || 0).getTime();
      const bTime = new Date(b.downloaded_at || 0).getTime();
      return bTime - aTime;
    });
}

export async function removeLocalTrailDraft(routeId: string): Promise<void> {
  const stored = await readStoredDraftMap();
  delete stored[routeId];
  await writeStoredDraftMap(stored);
}

export function createCheckpointKey(checkpoint: RouteCheckpoint, index: number): string {
  if (checkpoint.poi_id) return checkpoint.poi_id;
  return `${checkpoint.role || 'checkpoint'}-${index}-${checkpoint.latitude.toFixed(5)}-${checkpoint.longitude.toFixed(5)}`;
}

export function getNextCheckpoint(
  route: RouteSummary,
  completedKeys: string[],
): { checkpoint: RouteCheckpoint; index: number; key: string } | null {
  const checkpoints = route.checkpoints || [];
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    if (!checkpoint.is_required && checkpoint.role !== 'finish' && checkpoint.role !== 'start') {
      continue;
    }
    const key = createCheckpointKey(checkpoint, index);
    if (!completedKeys.includes(key)) {
      return { checkpoint, index, key };
    }
  }
  return null;
}

export function getDistanceFromRoute(position: GPSPosition, routePoints: RoutePoint[]): number {
  if (!routePoints.length) return 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const point of routePoints) {
    const distance = calculateDistance(position, {
      latitude: point.latitude,
      longitude: point.longitude,
    });
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return Number.isFinite(minDistance) ? minDistance : 0;
}

export function routeToPois(route: RouteSummary): POI[] {
  return (route.checkpoints || []).map((checkpoint, index) => ({
    id: createCheckpointKey(checkpoint, index),
    name: checkpoint.title || `POI ${index + 1}`,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    rarity: checkpoint.role === 'finish' ? 'legendary' : checkpoint.role === 'start' ? 'epic' : 'rare',
    description: checkpoint.body || null,
  }));
}
