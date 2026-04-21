/**
 * API Client for the OnTrail Expo companion app.
 *
 * Mirrors the web client (apps/web/src/lib/api.ts) but uses expo-secure-store
 * for token persistence and attaches X-Device-Attestation on every request.
 */
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL, SECURE_STORE_KEYS } from './constants';
import type {
  AuthResponse,
  AuthUser,
  CheckinPayload,
  CreateRoutePayload,
  HealthSyncPayload,
  POI,
  ProfileUpdate,
  RouteSummary,
  RunnerProfile,
  StepSyncPayload,
} from './types';

// ---------------------------------------------------------------------------
// Device attestation – module may not exist yet; gracefully degrade to "none"
// ---------------------------------------------------------------------------
let getAttestationToken: () => Promise<string | null> = async () => null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./deviceAttestation');
  if (typeof mod?.getAttestationToken === 'function') {
    getAttestationToken = mod.getAttestationToken;
  }
} catch {
  // module not available yet – attestation header will be "none"
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  setTokens: (access: string, refresh: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  onSessionExpired: () => void;
}

export interface MintResult {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  rarity: string;
}

export interface CheckinResult {
  message: string;
  checkin_id: string;
}

export interface PublicSettings {
  google_client_id?: string;
  google_web_client_id?: string;
  google_ios_client_id?: string;
  google_android_client_id?: string;
  google_expo_client_id?: string;
}

// ---------------------------------------------------------------------------
// Session-expired callback – set by the app root layout
// ---------------------------------------------------------------------------
let _onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(cb: () => void): void {
  _onSessionExpired = cb;
}

// ---------------------------------------------------------------------------
// Token helpers (SecureStore)
// ---------------------------------------------------------------------------
async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
  } catch {
    return null;
  }
}

async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

async function setTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access);
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refresh);
}

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
}

// ---------------------------------------------------------------------------
// Refresh guard – prevents concurrent refresh attempts
// ---------------------------------------------------------------------------
let _refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string };
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

/**
 * Generic request helper.
 *
 * 1. Uses API_BASE_URL (https://api.ontrail.tech)
 * 2. Sets Content-Type: application/json unless body is FormData
 * 3. Attaches Bearer token from SecureStore when available
 * 4. Attaches X-Device-Attestation header (token or "none")
 * 5. On 401: refresh → retry once → on failure clear tokens + onSessionExpired
 */
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const isFormData = options.body instanceof FormData;

  // Resolve attestation token (or "none")
  let attestation = 'none';
  try {
    const att = await getAttestationToken();
    if (att) attestation = att;
  } catch {
    // attestation unavailable – proceed with "none"
  }

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    'X-Device-Attestation': attestation,
    ...((options.headers as Record<string, string> | undefined) || {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  // --- 401 interceptor ---
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    // Deduplicate concurrent refresh attempts
    if (!_refreshPromise) {
      _refreshPromise = attemptTokenRefresh().finally(() => {
        _refreshPromise = null;
      });
    }
    const newToken = await _refreshPromise;

    if (newToken) {
      // Retry original request once with the fresh token
      const retryHeaders: Record<string, string> = {
        Authorization: `Bearer ${newToken}`,
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        'X-Device-Attestation': attestation,
        ...((options.headers as Record<string, string> | undefined) || {}),
      };
      const retryRes = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: retryHeaders,
      });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ detail: retryRes.statusText }));
        throw new Error(err.detail || 'Request failed');
      }
      return (await retryRes.json()) as T;
    }

    // Refresh failed → clear tokens and notify
    await clearTokens();
    _onSessionExpired?.();
    throw new Error('Session expired');
  }

  // --- Normal error handling ---
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Typed API methods
// ---------------------------------------------------------------------------

export const apiClient = {
  // ── Auth ─────────────────────────────────────────────────────────────
  requestOtp: (email: string) =>
    request<{ message: string; is_new_user: boolean; expires_in_seconds?: number }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyOtp: (email: string, code: string) =>
    request<AuthResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code, purpose: 'login' }),
    }),

  authGoogle: (idToken: string) =>
    request<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    }),

  authApple: (identityToken: string) =>
    request<AuthResponse>('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identity_token: identityToken }),
    }),

  authChallenge: (walletAddress: string) =>
    request<{ nonce: string; message: string }>('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ wallet_address: walletAddress }),
    }),

  authWallet: (walletAddress: string, signature: string, message: string) =>
    request<AuthResponse>('/auth/wallet', {
      method: 'POST',
      body: JSON.stringify({ wallet_address: walletAddress, signature, message }),
    }),

  authRefresh: (refreshToken: string) =>
    request<{ access_token: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  authLogout: (refreshToken: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  getPublicSettings: () => request<PublicSettings>('/admin/public-settings'),

  // ── Trail Studio ─────────────────────────────────────────────────────
  createRoute: (payload: CreateRoutePayload) =>
    request<RouteSummary>('/route/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMyRoutes: () => request<RouteSummary[]>('/route/mine'),

  getRoutesByRunner: (username: string) =>
    request<RouteSummary[]>(`/route/by-runner/${username}`),

  discoverRoutes: () => request<RouteSummary[]>('/route/discover'),

  getRouteById: (routeId: string) =>
    request<RouteSummary>(`/route/${routeId}`),

  startRoute: (routeId: string) =>
    request<{ session_id: string; status: string }>('/route/start', {
      method: 'POST',
      body: JSON.stringify({ route_id: routeId }),
    }),

  completeRoute: (routeId: string, sessionId: string) =>
    request<{ route_nft_id: string; completion_count: number }>('/route/complete', {
      method: 'POST',
      body: JSON.stringify({ route_id: routeId, session_id: sessionId }),
    }),

  // ── Profile ──────────────────────────────────────────────────────────
  getMe: () => request<AuthUser>('/users/me'),

  getRunner: (username: string) =>
    request<RunnerProfile>(`/users/runner/${username}`),

  updateProfile: (payload: ProfileUpdate) =>
    request<AuthUser>('/users/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadProfileImage: (file: FormData) =>
    request<{ avatar_url: string }>('/users/me/media/profile-image', {
      method: 'POST',
      body: file,
    }),

  // ── POI & Map ────────────────────────────────────────────────────────
  getNearbyPois: (lat: number, lon: number, radiusKm: number) =>
    request<POI[]>(`/poi/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`),

  mintPoi: (name: string, lat: number, lon: number) =>
    request<MintResult>('/poi/mint', {
      method: 'POST',
      body: JSON.stringify({ name, latitude: lat, longitude: lon }),
    }),

  checkin: (data: CheckinPayload) =>
    request<CheckinResult>('/route/checkin', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Steps & Health ───────────────────────────────────────────────────
  syncSteps: (payload: StepSyncPayload) =>
    request<void>('/steps/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  syncHealth: (payload: HealthSyncPayload) =>
    request<void>('/health/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Push Notifications ───────────────────────────────────────────────
  registerDeviceToken: (token: string) =>
    request<void>('/users/me/device-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'expo' }),
    }),

  unregisterDeviceToken: () =>
    request<void>('/users/me/device-token', {
      method: 'DELETE',
    }),
};

// Re-export token helpers for use by authManager
export {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
};
