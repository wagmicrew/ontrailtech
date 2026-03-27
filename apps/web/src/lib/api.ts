const API_BASE = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

// --- Auth response type used by most auth endpoints ---
export interface AuthUser {
  id: string;
  username: string | null;
  email: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
  reputation_score: number;
  roles: string[];
  onboarding_completed: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

// --- Token storage keys ---
const TOKEN_KEY = 'ontrail_token';
const REFRESH_TOKEN_KEY = 'ontrail_refresh_token';

// --- Flag to prevent concurrent refresh attempts ---
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // 401 interceptor: attempt refresh and retry (skip for refresh endpoint to avoid loops)
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = attemptTokenRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }
    const newToken = await (refreshPromise ?? attemptTokenRefresh());
    if (newToken) {
      // Retry original request with new token
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
      };
      const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ detail: retryRes.statusText }));
        throw new Error(err.detail || 'Request failed');
      }
      return retryRes.json();
    }
    // Refresh failed — clear tokens and redirect to home
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // --- Auth endpoints ---
  authRegister: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  authLogin: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  authRequestOTP: (email: string) =>
    request<{ message: string; is_new_user: boolean }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  authVerifyOTP: (email: string, code: string, purpose?: string, newPassword?: string) =>
    request<AuthResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email,
        code,
        ...(purpose ? { purpose } : {}),
        ...(newPassword ? { new_password: newPassword } : {}),
      }),
    }),

  authForgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  authGoogle: (idToken: string) =>
    request<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
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
    request<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  authConnectWallet: (walletAddress: string, signature: string, message: string) =>
    request<{ message: string }>('/auth/connect/wallet', {
      method: 'POST',
      body: JSON.stringify({ wallet_address: walletAddress, signature, message }),
    }),

  // --- User profile endpoints ---
  getMe: () => request<AuthUser>('/users/me'),

  updateAvatar: (avatarUrl: string) =>
    request<{ message: string }>('/users/me/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  // --- Onboarding endpoints ---
  createProfileWallet: () =>
    request<{ wallet_address: string }>('/onboarding/create-wallet', { method: 'POST' }),

  autoFollow: () =>
    request<{ message: string }>('/onboarding/auto-follow', { method: 'POST' }),

  completeOnboarding: () =>
    request<{ message: string }>('/onboarding/complete', { method: 'POST' }),

  // --- Users ---
  getUser: (id: string) => request<any>(`/users/${id}`),
  getRunner: (username: string) => request<any>(`/users/runner/${username}`),
  getReputation: (id: string) => request<any>(`/users/${id}/reputation`),

  // --- POIs ---
  getNearbyPois: (lat: number, lon: number, radius: number = 5) =>
    request<any[]>(`/poi/nearby?lat=${lat}&lon=${lon}&radius_km=${radius}`),
  mintPoi: (name: string, lat: number, lon: number, description?: string) =>
    request<any>('/poi/mint', {
      method: 'POST', body: JSON.stringify({ name, latitude: lat, longitude: lon, description }),
    }),

  // --- Routes ---
  createRoute: (data: any) => request<any>('/route/create', { method: 'POST', body: JSON.stringify(data) }),
  startRoute: (routeId: string) =>
    request<any>('/route/start', { method: 'POST', body: JSON.stringify({ route_id: routeId }) }),
  checkin: (data: any) => request<any>('/route/checkin', { method: 'POST', body: JSON.stringify(data) }),
  completeRoute: (routeId: string, sessionId: string) =>
    request<any>('/route/complete', { method: 'POST', body: JSON.stringify({ route_id: routeId, session_id: sessionId }) }),

  // --- Tokens ---
  getPrice: (runnerId: string, amount: number = 1) =>
    request<any>(`/token/price/${runnerId}?amount=${amount}`),
  buyShares: (runnerId: string, amount: number) =>
    request<any>('/token/buy', { method: 'POST', body: JSON.stringify({ runner_id: runnerId, amount }) }),
  sellShares: (runnerId: string, amount: number) =>
    request<any>('/token/sell', { method: 'POST', body: JSON.stringify({ runner_id: runnerId, amount }) }),
  getPoolStatus: (runnerId: string) => request<any>(`/token/pool/${runnerId}`),

  // --- Health ---
  health: () => request<{ status: string }>('/health'),

  // --- Roles ---
  getUserRoles: (userId: string) => request<{ roles: string[] }>(`/users/${userId}/roles`),

  // --- Site Settings (public) ---
  getPublicSettings: () => request<Record<string, string>>('/admin/public-settings'),

  // --- FriendPass ---
  getFriendPassPrice: (runnerId: string) => request<any>(`/friendpass/price/${runnerId}`),
  getFriendPassStatus: (txHash: string) => request<any>(`/runners/friendpass/status/${txHash}`),

  // --- Identity ---
  checkUsername: (username: string) => request<any>(`/identity/check/${username}`),
  claimIdentity: (username: string, avatarUrl?: string) =>
    request<any>('/identity/claim', {
      method: 'POST', body: JSON.stringify({ username, avatar_url: avatarUrl }),
    }),

  // --- Referrals ---
  generateReferral: () => request<any>('/referrals/generate', { method: 'POST' }),
  getReferralStats: (userId: string) => request<any>(`/referrals/stats/${userId}`),
  getInfluenceGraph: (userId: string) => request<any>(`/referrals/influence/${userId}`),

  // --- Runners ---
  getTokenProgress: (runnerId: string) => request<any>(`/runners/${runnerId}/token-progress`),
  getDashboardProgress: () => request<any>('/runners/dashboard/progress'),
  boostRunner: (username: string) =>
    request<any>(`/runners/boost/${username}`, { method: 'POST' }),

  // --- Notifications ---
  getNotifications: () => request<any>('/runners/notifications'),
  markNotificationRead: (id: string) =>
    request<any>(`/runners/notifications/${id}/read`, { method: 'POST' }),

  // --- Cards ---
  generateCard: (cardType: string, headline: string, data: any) =>
    request<any>('/runners/cards/generate', {
      method: 'POST', body: JSON.stringify({ card_type: cardType, headline, data }),
    }),

  // --- Aura ---
  getRunnerAura: (runnerId: string) => request<any>(`/aura/${runnerId}`),
  getRunnerLeaderboard: () => request<any>('/aura/leaderboard/runners'),
  getAncientLeaderboard: () => request<any>('/aura/leaderboard/ancients'),

  // --- Graph ---
  getGraphNode: (username: string) => request<any>(`/graph/node/${username}`),
  getGraphNeighbors: (username: string) => request<any>(`/graph/neighbors/${username}`),
  getGraphTrending: () => request<any>('/graph/trending'),

  // --- Admin Settings ---
  getAllSettings: () => request<any[]>('/admin/settings'),
  updateSetting: (key: string, value: string) =>
    request<any>('/admin/settings', { method: 'POST', body: JSON.stringify({ setting_key: key, setting_value: value }) }),
};
