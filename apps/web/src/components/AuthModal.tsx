import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { api, AuthResponse } from '../lib/api';
import OTPInput from './OTPInput';

// Extend window for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (response: AuthResponse) => void;
  defaultTab?: 'email' | 'google' | 'wallet';
}

type Tab = 'email' | 'google' | 'wallet';

const tabVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export default function AuthModal({ isOpen, onClose, onSuccess, defaultTab = 'email' }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  // Email tab state
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes or tab changes
  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      resetFields();
    }
  }, [isOpen, defaultTab]);

  useEffect(() => {
    resetFields();
  }, [tab]);

  function resetFields() {
    setEmail('');
    setOtpSent(false);
    setIsNewUser(false);
    setError('');
    setLoading(false);
  }

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [isOpen, onClose]);

  const handleRequestOTP = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await api.authRequestOTP(email);
      setIsNewUser(result.is_new_user ?? false);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleVerifyOTP = useCallback(async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const response = await api.authVerifyOTP(email, code, 'login');
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  }, [email, onSuccess]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'google', label: 'Google' },
    { key: 'wallet', label: 'Wallet' },
  ];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xl bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 relative"
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Title */}
        <h2 className="text-xl font-semibold text-gray-900 mb-5 text-center">Welcome to OnTrail</h2>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t.key
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {tab === 'email' && (
            <motion.div key="email" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <EmailTab
                email={email}
                setEmail={setEmail}
                otpSent={otpSent}
                isNewUser={isNewUser}
                error={error}
                loading={loading}
                onRequestOTP={handleRequestOTP}
                onVerifyOTP={handleVerifyOTP}
                onResetEmail={resetFields}
              />
            </motion.div>
          )}

          {tab === 'google' && (
            <motion.div key="google" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <GoogleTab onSuccess={onSuccess} onError={(msg) => setError(msg)} />
            </motion.div>
          )}

          {tab === 'wallet' && (
            <motion.div key="wallet" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <WalletTab onSuccess={onSuccess} onError={(msg) => setError(msg)} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Shared UI helpers ─── */

function InputField({ type = 'text', placeholder, value, onChange, disabled }: {
  type?: string; placeholder: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm disabled:opacity-50"
    />
  );
}

function PrimaryButton({ children, onClick, loading, disabled }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl py-3 font-medium hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return <p className="text-red-500 text-xs mt-1">{message}</p>;
}

/* ─── Email Tab ─── */

interface EmailTabProps {
  email: string;
  setEmail: (v: string) => void;
  otpSent: boolean;
  isNewUser: boolean;
  error: string;
  loading: boolean;
  onRequestOTP: () => void;
  onVerifyOTP: (code: string) => void;
  onResetEmail: () => void;
}

function EmailTab({
  email, setEmail,
  otpSent, isNewUser,
  error, loading,
  onRequestOTP, onVerifyOTP, onResetEmail,
}: EmailTabProps) {
  if (!otpSent) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 text-center">
          Enter your email to sign in or create an account.
        </p>
        <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} />
        <ErrorMessage message={error} />
        <PrimaryButton onClick={onRequestOTP} loading={loading} disabled={!email.trim()}>
          Continue
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isNewUser ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 text-center">
          <p className="font-semibold mb-1">Welcome to OnTrail! 🎉</p>
          <p>
            Your account has been created. We sent a 6-digit code to{' '}
            <strong>{email}</strong> — enter it below to get started.
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to sign in.
        </p>
      )}
      <ErrorMessage message={error} />
      <OTPInput onComplete={onVerifyOTP} disabled={loading} error={error || undefined} />
      <button
        onClick={onResetEmail}
        className="text-xs text-gray-400 hover:text-gray-600 w-full text-center"
      >
        Use a different email
      </button>
    </div>
  );
}

/* ─── Google Tab ─── */

function GoogleTab({ onSuccess, onError }: {
  onSuccess: (r: AuthResponse) => void;
  onError: (msg: string) => void;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');

  useEffect(() => {
    let active = true;

    api.getPublicSettings()
      .then((settings) => {
        if (!active) return;
        setClientId(settings.google_web_client_id || settings.google_client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
      })
      .catch(() => {
        if (!active) return;
        setClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;

    const init = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          setLoading(true);
          try {
            const result = await api.authGoogle(response.credential);
            onSuccess(result);
          } catch (e: any) {
            onError(e.message || 'Google sign-in failed');
          } finally {
            setLoading(false);
          }
        },
        auto_select: false,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: (btnRef.current.offsetWidth || 400).toString(),
      });
    };

    if (window.google) {
      init();
    } else {
      const scriptId = 'gsi-client';
      if (!document.getElementById(scriptId)) {
        const s = document.createElement('script');
        s.id = scriptId;
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = init;
        document.head.appendChild(s);
      } else {
        // Script tag exists but window.google not ready yet
        const interval = setInterval(() => {
          if (window.google) { clearInterval(interval); init(); }
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, [clientId, onSuccess, onError]);

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500 text-center">Sign in with your Google account</p>
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-2">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Signing in…
        </div>
      )}
      <div ref={btnRef} className="flex justify-center min-h-[44px]" />
      {!clientId && (
        <p className="text-xs text-amber-500 text-center">Google web client ID is not configured in site settings yet.</p>
      )}
    </div>
  );
}

/* ─── Wallet Tab ─── */

function WalletTab({ onSuccess, onError }: {
  onSuccess: (r: AuthResponse) => void;
  onError: (msg: string) => void;
}) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(false);

  const handleSIWE = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const { message } = await api.authChallenge(address);
      const signature = await signMessageAsync({ message });
      const result = await api.authWallet(address, signature, message);
      onSuccess(result);
    } catch (e: any) {
      if (e.message?.includes('rejected') || e.message?.includes('denied')) {
        onError('Signature rejected by wallet');
      } else {
        onError(e.message || 'Wallet sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  }, [address, signMessageAsync, onSuccess, onError]);

  if (!isConnected) {
    return (
      <div className="space-y-4 py-4">
        <p className="text-sm text-gray-500 text-center">Connect your Ethereum wallet to sign in with SIWE</p>
        <ConnectKitButton.Custom>
          {({ show }: { show?: () => void }) => (
            <button
              onClick={() => show?.()}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl py-3 font-medium text-sm flex items-center justify-center gap-2 hover:from-blue-600 hover:to-indigo-700 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 11h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" />
              </svg>
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500 text-center">Sign the message in your wallet to authenticate</p>
      <p className="text-xs font-mono text-center text-gray-400 bg-gray-50 rounded-lg px-3 py-2 truncate">{address}</p>
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-3">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Waiting for signature…
        </div>
      ) : (
        <button
          onClick={handleSIWE}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl py-3 font-medium text-sm hover:from-blue-600 hover:to-indigo-700 transition-all"
        >
          Sign In with Wallet
        </button>
      )}
    </div>
  );
}
