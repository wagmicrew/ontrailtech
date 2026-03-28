/**
 * Shared type definitions for the OnTrail Expo companion app.
 * These interfaces mirror the backend API models consumed by the mobile client.
 */

/** JWT token pair stored in SecureStore */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Response from all auth endpoints (OTP, Google, Apple, wallet) */
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

/** Authenticated user profile from GET /users/me */
export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
  reputation_score: number;
  roles: string[];
  step_balance: number;
}

/** Public runner profile from GET /users/runner/{username} */
export interface RunnerProfile {
  username: string;
  avatar_url: string | null;
  bio: string | null;
  reputation: number;
  rank: number;
  aura: number;
  step_balance: number;
  friendpass_sold: number;
  friendpass_max_supply: number;
  friendpass_price: number;
  supporter_count: number;
}

/** Point of Interest from GET /poi/nearby */
export interface POI {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  description: string | null;
}

/** Payload for POST /steps/sync */
export interface StepSyncPayload {
  steps: number;
  period_start: string; // ISO 8601
  period_end: string;   // ISO 8601
  source: 'pedometer';
}

/** Payload for POST /health/sync */
export interface HealthSyncPayload {
  steps: number;
  distance_meters: number;
  calories_burned: number;
  period_start: string; // ISO 8601
  period_end: string;   // ISO 8601
  source: 'apple_health' | 'google_fit';
}

/** GPS position reading from expo-location */
export interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;  // meters
  timestamp: number;
}

/** Result of proximity verification */
export interface VerifyResult {
  allowed: boolean;
  distance: number;       // meters
  accuracyWarning: boolean; // true if accuracy > 100m
}

/** Payload for POST /route/checkin */
export interface CheckinPayload {
  poi_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string; // ISO 8601
  attestation_token?: string;
}

/** Queued offline request persisted to AsyncStorage */
export interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body: string;
  createdAt: string; // ISO 8601
  retryCount: number;
}

/** Payload for PATCH /users/me/profile */
export interface ProfileUpdate {
  username?: string;
  email?: string;
  bio?: string;
  location?: string;
  preferred_reward_wallet?: string;
}
