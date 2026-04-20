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
  username: string | null;
  email: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
  header_image_url?: string | null;
  bio?: string | null;
  location?: string | null;
  preferred_reward_wallet?: string | null;
  reputation_score: number;
  roles: string[];
  step_balance: number;
  onboarding_completed?: boolean;
}

export interface FriendPassInfo {
  sold: number;
  maxSupply: number;
  currentPrice: string;
  currentPriceFiat?: string;
  nextPrice?: string;
}

export interface RunnerStats {
  totalSupporters: number;
  totalTips: string;
  tokenProgress: number;
}

export interface ActivityFeedItem {
  type: string;
  username?: string | null;
  amount?: string | null;
  timeAgo: string;
}

/** Public runner profile from GET /users/runner/{username} */
export interface RunnerProfile {
  id?: string;
  username: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  header_image_url?: string | null;
  headerImageUrl?: string | null;
  bio: string | null;
  reputation?: number;
  reputationScore?: number;
  rank: number;
  aura?: number;
  auraLevel?: string;
  step_balance?: number;
  friendpass_sold?: number;
  friendpass_max_supply?: number;
  friendpass_price?: number;
  supporter_count?: number;
  tokenStatus?: string;
  friendPass?: FriendPassInfo;
  stats?: RunnerStats;
  activityFeed?: ActivityFeedItem[];
  poi_count?: number;
  route_count?: number;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  label?: string;
  timestamp?: string;
  manual?: boolean;
}

export interface RouteCheckpoint {
  poi_id?: string;
  title: string;
  body?: string;
  photo_url?: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  distance_from_start_m?: number;
  is_required?: boolean;
}

export interface RouteSummary {
  id: string;
  name: string;
  difficulty: string;
  distance_km: number;
  completion_count: number;
  description?: string | null;
  creator_username?: string | null;
  build_mode?: 'auto' | 'manual';
  is_loop?: boolean;
  is_minted?: boolean;
  poi_count?: number;
  start_poi_name?: string | null;
  end_poi_name?: string | null;
}

export interface CreateRoutePayload {
  name: string;
  description?: string;
  difficulty?: string;
  estimated_duration_min: number;
  poi_ids: string[];
  build_mode?: 'auto' | 'manual';
  is_loop?: boolean;
  is_minted?: boolean;
  route_points?: RoutePoint[];
  checkpoints?: RouteCheckpoint[];
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
