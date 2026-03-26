import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
  wallet: string | null;
  userId: string | null;
  username: string | null;
  email: string | null;
  login: () => void;
  logout: () => void;
  loginWithWallet: () => void;
}

const AuthContext = createContext<AuthState>({
  isConnected: false, isLoading: true,
  wallet: null, userId: null, username: null, email: null,
  login: () => {}, logout: () => {}, loginWithWallet: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (ready && authenticated && user) {
      // Get wallet from Privy user (embedded or linked)
      const w = user.wallet?.address || user.linkedAccounts?.find(
        (a: any) => a.type === 'wallet'
      )?.address || null;
      setWallet(w);
      setUserId(user.id);
      setEmail(user.email?.address || null);
      // Username from Privy custom fields or generate from wallet
      setUsername(w ? w.slice(2, 8).toLowerCase() : null);
    } else {
      setWallet(null); setUserId(null); setUsername(null); setEmail(null);
    }
  }, [ready, authenticated, user]);

  const loginWithWallet = () => {
    login({ loginMethods: ['wallet'] });
  };

  return (
    <AuthContext.Provider value={{
      isConnected: authenticated,
      isLoading: !ready,
      wallet, userId, username, email,
      login, logout, loginWithWallet,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
