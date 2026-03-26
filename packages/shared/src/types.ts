// ── Enums ──
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'expert';
export type TokenStatus = 'bonding_curve' | 'tge_ready' | 'launched';
export type FraudFlag =
  | 'impossible_speed'
  | 'teleportation'
  | 'gps_spoofing'
  | 'step_mismatch'
  | 'route_discontinuity'
  | 'device_attestation_failed';
export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

// ── Core Models ──
export interface User {
  id: string;
  username: string;
  email: string;
  walletAddress: string;
  reputationScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface POI {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  rarity: Rarity;
  ownerId: string;
  gridId: string;
  nftTokenId?: string;
  nftContractAddress?: string;
  mintedAt: string;
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  difficulty: Difficulty;
  distanceKm: number;
  elevationGainM?: number;
  estimatedDurationMin: number;
  poiIds: string[];
  createdAt: string;
  completionCount: number;
}

export interface GridCell {
  id: string;
  h3Index: string;
  resolution: number;
  maxPois: number;
  rarityDistribution: Record<Rarity, number>;
  currentPoisCount: number;
  createdAt: string;
}

export interface POISlot {
  id: string;
  gridId: string;
  rarity: Rarity;
  occupied: boolean;
  poiId?: string;
}

export interface RunnerToken {
  id: string;
  runnerId: string;
  tokenName: string;
  tokenSymbol: string;
  contractAddress?: string;
  totalSupply: number;
  bondingCurvePool: string;
  status: TokenStatus;
  tgeDate?: string;
  createdAt: string;
}

export interface FriendShare {
  id: string;
  ownerId: string;
  runnerId: string;
  amount: number;
  purchasePrice: string;
  purchasedAt: string;
}

export interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number;
  speed?: number;
}

export interface ReputationBreakdown {
  total: number;
  components: {
    poisOwned: number;
    routesCompleted: number;
    friendNetwork: number;
    tokenImpact: number;
  };
}

// ── API Request/Response Types ──
export interface AuthChallengeResponse {
  nonce: string;
  message: string;
}

export interface AuthLoginRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface MintPOIRequest {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
}

export interface PriceQuote {
  totalCost: string;
  currentSupply: number;
  pricePerShare: string;
}

export interface TransactionResult {
  txHash: string;
  amount: number;
  price: string;
  timestamp: string;
}
