import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '../lib/api';
import { loadState, saveState } from '../lib/journey';

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

const REFERRER_KEY = 'ontrail_referrer';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const onboardingCalledRef = useRef(false);

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

      // Call onboarding register on first successful auth
      if (!onboardingCalledRef.current) {
        onboardingCalledRef.current = true;
        handleOnboardingRegister();
      }
    } else {
      setWallet(null); setUserId(null); setUsername(null); setEmail(null); setRoles([]);
      onboardingCalledRef.current = false;
    }
  }, [ready, authenticated, user]);

  async function handleOnboardingRegister() {
    try {
      // Get Privy auth token
      const privyToken = await getAccessToken();
      if (!privyToken) return;

      // Read referrer from localStorage
      const referrer = localStorage.getItem(REFERRER_KEY);

      // Read runner context from journey state
      const journeyState = loadState();
      const runnerContext = journeyState?.runnerUsername || null;

      // Call POST /onboarding/register
      const response = await api.onboardingRegister(privyToken, referrer, runnerContext);

      // Store the returned JWT
      localStorage.setItem('ontrail_token', response.access_token);

      // Update local state with returned user data
      if (response.user) {
        setUserId(response.user.id);
        setUsername(response.user.username);
        setEmail(response.user.email);
        if (response.user.wallet_address) {
          setWallet(response.user.wallet_address);
        }
      }

      // Advance journey state to friendpass_purchase phase
      if (journeyState && journeyState.phase === 'onboarding') {
        const updatedState = {
          ...journeyState,
          userId: response.user.id,
          referrerUsername: referrer,
          phase: 'friendpass_purchase' as const,
          completedPhases: journeyState.completedPhases.includes('onboarding')
            ? journeyState.completedPhases
            : [...journeyState.completedPhases, 'onboarding' as const],
        };
        saveState(updatedState);
      }
    } catch (err) {
      // Onboarding registration failed — user can still use the app
      // The endpoint is idempotent so retrying on next auth is safe
      console.error('Onboarding registration failed:', err);
    }
  }

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
