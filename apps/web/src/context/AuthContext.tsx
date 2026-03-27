import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api, AuthResponse, AuthUser } from '../lib/api';
import AuthModal from '../components/AuthModal';
import OnboardingWizard from '../components/OnboardingWizard';

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
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  login: () => void;
  logout: () => void;
  loginWithWallet: () => void;
  authModalOpen: boolean;
  authModalDefaultTab: 'email' | 'google' | 'wallet';
  handleAuthSuccess: (response: AuthResponse) => void;
  refreshMe: () => Promise<void>;
}

const TOKEN_KEY = 'ontrail_token';
const REFRESH_TOKEN_KEY = 'ontrail_refresh_token';

const AuthContext = createContext<AuthState>({
  isConnected: false,
  isLoading: true,
  wallet: null,
  userId: null,
  username: null,
  email: null,
  roles: [],
  isAdmin: false,
  isAncientOwner: false,
  avatarUrl: null,
  onboardingCompleted: false,
  login: () => {},
  logout: () => {},
  loginWithWallet: () => {},
  authModalOpen: false,
  authModalDefaultTab: 'email',
  handleAuthSuccess: () => {},
  refreshMe: async () => {},
});

function hydrateFromUser(
  user: AuthUser,
  setters: {
    setUserId: (v: string | null) => void;
    setUsername: (v: string | null) => void;
    setEmail: (v: string | null) => void;
    setWallet: (v: string | null) => void;
    setRoles: (v: string[]) => void;
    setAvatarUrl: (v: string | null) => void;
    setOnboardingCompleted: (v: boolean) => void;
    setIsConnected: (v: boolean) => void;
  }
) {
  setters.setUserId(user.id);
  setters.setUsername(user.username);
  setters.setEmail(user.email);
  setters.setWallet(user.wallet_address);
  setters.setRoles(user.roles || []);
  setters.setAvatarUrl(user.avatar_url);
  setters.setOnboardingCompleted(user.onboarding_completed);
  setters.setIsConnected(true);
}

function clearAuthState(setters: {
  setUserId: (v: string | null) => void;
  setUsername: (v: string | null) => void;
  setEmail: (v: string | null) => void;
  setWallet: (v: string | null) => void;
  setRoles: (v: string[]) => void;
  setAvatarUrl: (v: string | null) => void;
  setOnboardingCompleted: (v: boolean) => void;
  setIsConnected: (v: boolean) => void;
}) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  setters.setUserId(null);
  setters.setUsername(null);
  setters.setEmail(null);
  setters.setWallet(null);
  setters.setRoles([]);
  setters.setAvatarUrl(null);
  setters.setOnboardingCompleted(false);
  setters.setIsConnected(false);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalDefaultTab, setAuthModalDefaultTab] = useState<'email' | 'google' | 'wallet'>('email');

  const setters = {
    setUserId, setUsername, setEmail, setWallet,
    setRoles, setAvatarUrl, setOnboardingCompleted, setIsConnected,
  };

  // On mount: check localStorage for token → hydrate via getMe → refresh on 401 → clear on failure
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const user = await api.getMe();
        if (!cancelled) {
          hydrateFromUser(user, setters);
        }
      } catch {
        // Attempt refresh
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          try {
            const refreshResult = await api.authRefresh(refreshToken);
            localStorage.setItem(TOKEN_KEY, refreshResult.access_token);
            // Retry getMe with new token
            const user = await api.getMe();
            if (!cancelled) {
              hydrateFromUser(user, setters);
            }
          } catch {
            if (!cancelled) {
              clearAuthState(setters);
            }
          }
        } else {
          if (!cancelled) {
            clearAuthState(setters);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, response.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
    hydrateFromUser(response.user, setters);
    setAuthModalOpen(false);
  }, []);

  const login = useCallback(() => {
    setAuthModalDefaultTab('email');
    setAuthModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        await api.authLogout(refreshToken);
      } catch {
        // Logout API call failed — still clear local state
      }
    }
    clearAuthState(setters);
  }, []);

  const loginWithWallet = useCallback(() => {
    setAuthModalDefaultTab('wallet');
    setAuthModalOpen(true);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const user = await api.getMe();
      hydrateFromUser(user, setters);
    } catch {
      clearAuthState(setters);
    }
  }, []);

  const isAdmin = roles.includes('admin') || roles.includes('ancient_owner');
  const isAncientOwner = roles.includes('ancient_owner');

  return (
    <AuthContext.Provider value={{
      isConnected,
      isLoading,
      wallet,
      userId,
      username,
      email,
      roles,
      isAdmin,
      isAncientOwner,
      avatarUrl,
      onboardingCompleted,
      login,
      logout,
      loginWithWallet,
      authModalOpen,
      authModalDefaultTab,
      handleAuthSuccess,
      refreshMe,
    }}>
      {children}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        defaultTab={authModalDefaultTab}
      />
      {isConnected && !onboardingCompleted && (
        <OnboardingWizard
          user={{ id: userId!, username, email, wallet_address: wallet, avatar_url: avatarUrl }}
          onComplete={() => setOnboardingCompleted(true)}
        />
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
