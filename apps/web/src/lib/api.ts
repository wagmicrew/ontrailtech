const API_BASE = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ontrail_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  getChallenge: (wallet: string) =>
    request<{ nonce: string; message: string }>('/auth/challenge', {
      method: 'POST', body: JSON.stringify({ wallet_address: wallet }),
    }),
  login: (wallet: string, signature: string, nonce: string) =>
    request<{ access_token: string; refresh_token: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ wallet_address: wallet, signature, nonce }),
    }),
  register: (wallet: string, signature: string, nonce: string, username: string) =>
    request<{ access_token: string; refresh_token: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ wallet_address: wallet, signature, nonce, username }),
    }),

  // Users
  getUser: (id: string) => request<any>(`/users/${id}`),
  getRunner: (username: string) => request<any>(`/users/runner/${username}`),
  getReputation: (id: string) => request<any>(`/users/${id}/reputation`),

  // POIs
  getNearbyPois: (lat: number, lon: number, radius: number = 5) =>
    request<any[]>(`/poi/nearby?lat=${lat}&lon=${lon}&radius_km=${radius}`),
  mintPoi: (name: string, lat: number, lon: number, description?: string) =>
    request<any>('/poi/mint', {
      method: 'POST', body: JSON.stringify({ name, latitude: lat, longitude: lon, description }),
    }),

  // Routes
  createRoute: (data: any) => request<any>('/route/create', { method: 'POST', body: JSON.stringify(data) }),
  startRoute: (routeId: string) =>
    request<any>('/route/start', { method: 'POST', body: JSON.stringify({ route_id: routeId }) }),
  checkin: (data: any) => request<any>('/route/checkin', { method: 'POST', body: JSON.stringify(data) }),
  completeRoute: (routeId: string, sessionId: string) =>
    request<any>('/route/complete', { method: 'POST', body: JSON.stringify({ route_id: routeId, session_id: sessionId }) }),

  // Tokens
  getPrice: (runnerId: string, amount: number = 1) =>
    request<any>(`/token/price/${runnerId}?amount=${amount}`),
  buyShares: (runnerId: string, amount: number) =>
    request<any>('/token/buy', { method: 'POST', body: JSON.stringify({ runner_id: runnerId, amount }) }),
  sellShares: (runnerId: string, amount: number) =>
    request<any>('/token/sell', { method: 'POST', body: JSON.stringify({ runner_id: runnerId, amount }) }),
  getPoolStatus: (runnerId: string) => request<any>(`/token/pool/${runnerId}`),

  // Health
  health: () => request<{ status: string }>('/health'),
};
