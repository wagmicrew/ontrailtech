import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthState {
  token: string | null;
  wallet: string | null;
  userId: string | null;
  isConnected: boolean;
  login: (token: string, wallet: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null, wallet: null, userId: null, isConnected: false,
  login: () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('ontrail_token'));
  const [wallet, setWallet] = useState<string | null>(localStorage.getItem('ontrail_wallet'));
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('ontrail_user_id'));

  const login = (t: string, w: string) => {
    setToken(t); setWallet(w);
    localStorage.setItem('ontrail_token', t);
    localStorage.setItem('ontrail_wallet', w);
    // Decode user ID from JWT
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      setUserId(payload.sub);
      localStorage.setItem('ontrail_user_id', payload.sub);
    } catch {}
  };

  const logout = () => {
    setToken(null); setWallet(null); setUserId(null);
    localStorage.removeItem('ontrail_token');
    localStorage.removeItem('ontrail_wallet');
    localStorage.removeItem('ontrail_user_id');
  };

  return (
    <AuthContext.Provider value={{ token, wallet, userId, isConnected: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
