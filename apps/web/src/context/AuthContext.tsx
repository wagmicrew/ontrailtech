import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '../lib/api';

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
  wallet: string | null;
  userId: string | null;
  username: string | null;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
  isAncientOwner: boolean;
  login: () => void;
  logout: () => void;
  loginWithWallet: () => void;
}

const AuthContext = createContext<AuthState>({
  isConnected: false, isLoading: true,
  wallet: null, userId: null, username: null, email: null,
  roles: [], isAdmin: false, isAncientOwner: false,
  login: () => {}, logout: () => {}, loginWithWallet: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (ready && authenticated && user) {
      const w = user.wallet?.address || user.linkedAccounts?.find(
        (a: any) => a.type === 'wallet'
      )?.address || null;
      setWallet(w);
      setUserId(user.id);
      setEmail(user.email?.address || null);
      setUsername(w ? w.slice(2, 8).toLowerCase() : null);

      // Fetch roles if we have a user ID
      if (user.id) {
        api.getUserRoles(user.id).then((data: any) => {
          setRoles(data.roles || []);
        }).catch(() => setRoles([]));
      }
    } else {
      setWallet(null); setUserId(null); setUsername(null); setEmail(null); setRoles([]);
    }
  }, [ready, authenticated, user]);

  const loginWithWallet = () => {
    login({ loginMethods: ['wallet'] });
  };

  const isAdmin = roles.includes('admin') || roles.includes('ancient_owner');
  const isAncientOwner = roles.includes('ancient_owner');

  return (
    <AuthContext.Provider value={{
      isConnected: authenticated,
      isLoading: !ready,
      wallet, userId, username, email,
      roles, isAdmin, isAncientOwner,
      login, logout, loginWithWallet,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
