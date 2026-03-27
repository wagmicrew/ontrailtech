import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, AuthResponse } from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (response: AuthResponse) => void;
  defaultTab?: 'email' | 'google' | 'wallet';
}

type Tab = 'email' | 'google' | 'wallet';
type EmailMode = 'login' | 'register' | 'otp' | 'forgot-password' | 'reset-password';

const tabVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export default function AuthModal({ isOpen, onClose, onSuccess, defaultTab = 'email' }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [emailMode, setEmailMode] = useState<EmailMode>('login');

  // Email tab state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes or tab changes
  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      setEmailMode('login');
      resetFields();
    }
  }, [isOpen, defaultTab]);

  useEffect(() => {
    resetFields();
  }, [tab, emailMode]);

  function resetFields() {
    setEmail('');
    setPassword('');
    setNewPassword('');
    setOtpCode('');
    setOtpSent(false);
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

  const handleEmailLogin = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.authLogin(email, password);
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess]);

  const handleEmailRegister = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.authRegister(email, password);
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess]);

  const handleRequestOTP = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await api.authRequestOTP(email);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleVerifyOTP = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.authVerifyOTP(email, otpCode, 'login');
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  }, [email, otpCode, onSuccess]);

  const handleForgotPassword = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await api.authForgotPassword(email);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleResetPassword = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.authVerifyOTP(email, otpCode, 'reset');
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }, [email, otpCode, newPassword, onSuccess]);

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
        onClick={(e) => e.stopPropagation()}
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
            <motion.div key={`email-${emailMode}`} variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <EmailTab
                emailMode={emailMode}
                setEmailMode={setEmailMode}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                otpCode={otpCode}
                setOtpCode={setOtpCode}
                otpSent={otpSent}
                error={error}
                loading={loading}
                onLogin={handleEmailLogin}
                onRegister={handleEmailRegister}
                onRequestOTP={handleRequestOTP}
                onVerifyOTP={handleVerifyOTP}
                onForgotPassword={handleForgotPassword}
                onResetPassword={handleResetPassword}
              />
            </motion.div>
          )}

          {tab === 'google' && (
            <motion.div key="google" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <GoogleTab />
            </motion.div>
          )}

          {tab === 'wallet' && (
            <motion.div key="wallet" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
              <WalletTab />
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
  emailMode: EmailMode;
  setEmailMode: (m: EmailMode) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  otpCode: string;
  setOtpCode: (v: string) => void;
  otpSent: boolean;
  error: string;
  loading: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onRequestOTP: () => void;
  onVerifyOTP: () => void;
  onForgotPassword: () => void;
  onResetPassword: () => void;
}

function EmailTab({
  emailMode, setEmailMode,
  email, setEmail, password, setPassword,
  newPassword, setNewPassword,
  otpCode, setOtpCode, otpSent,
  error, loading,
  onLogin, onRegister, onRequestOTP, onVerifyOTP,
  onForgotPassword, onResetPassword,
}: EmailTabProps) {
  if (emailMode === 'login') {
    return (
      <div className="space-y-3">
        <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} />
        <InputField type="password" placeholder="Password" value={password} onChange={setPassword} />
        <ErrorMessage message={error} />
        <PrimaryButton onClick={onLogin} loading={loading}>Sign In</PrimaryButton>
        <div className="flex items-center justify-between text-xs">
          <button onClick={() => setEmailMode('register')} className="text-emerald-600 hover:underline">
            Don't have an account? Create one
          </button>
          <button onClick={() => setEmailMode('forgot-password')} className="text-gray-400 hover:text-gray-600">
            Forgot Password?
          </button>
        </div>
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
        </div>
        <button
          onClick={() => setEmailMode('otp')}
          className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Sign in with OTP code
        </button>
      </div>
    );
  }

  if (emailMode === 'register') {
    return (
      <div className="space-y-3">
        <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} />
        <InputField type="password" placeholder="Password (8+ chars, upper, lower, digit)" value={password} onChange={setPassword} />
        <ErrorMessage message={error} />
        <PrimaryButton onClick={onRegister} loading={loading}>Create Account</PrimaryButton>
        <button onClick={() => setEmailMode('login')} className="text-xs text-emerald-600 hover:underline w-full text-center">
          Already have an account? Sign in
        </button>
      </div>
    );
  }

  if (emailMode === 'otp') {
    return (
      <div className="space-y-3">
        <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} disabled={otpSent} />
        {!otpSent ? (
          <>
            <ErrorMessage message={error} />
            <PrimaryButton onClick={onRequestOTP} loading={loading}>Send Code</PrimaryButton>
          </>
        ) : (
          <>
            <InputField type="text" placeholder="Enter 6-digit code" value={otpCode} onChange={setOtpCode} />
            <ErrorMessage message={error} />
            <PrimaryButton onClick={onVerifyOTP} loading={loading}>Verify</PrimaryButton>
          </>
        )}
        <button onClick={() => setEmailMode('login')} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">
          Back to sign in
        </button>
      </div>
    );
  }

  if (emailMode === 'forgot-password') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Enter your email to receive a reset code.</p>
        <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} disabled={otpSent} />
        {!otpSent ? (
          <>
            <ErrorMessage message={error} />
            <PrimaryButton onClick={onForgotPassword} loading={loading}>Send Reset Code</PrimaryButton>
          </>
        ) : (
          <>
            <InputField type="text" placeholder="Enter 6-digit code" value={otpCode} onChange={setOtpCode} />
            <InputField type="password" placeholder="New password" value={newPassword} onChange={setNewPassword} />
            <ErrorMessage message={error} />
            <PrimaryButton onClick={onResetPassword} loading={loading}>Reset Password</PrimaryButton>
          </>
        )}
        <button onClick={() => setEmailMode('login')} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">
          Back to sign in
        </button>
      </div>
    );
  }

  // reset-password mode (fallback, shouldn't normally reach here)
  return null;
}

/* ─── Google Tab ─── */

function GoogleTab() {
  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500 text-center">Sign in with your Google account</p>
      <button
        onClick={() => {
          // TODO: Integrate actual Google OAuth popup
          console.log('Google OAuth — not yet implemented');
        }}
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {/* Google icon placeholder */}
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>
    </div>
  );
}

/* ─── Wallet Tab ─── */

function WalletTab() {
  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500 text-center">Connect your Ethereum wallet to sign in</p>
      <button
        onClick={() => {
          // TODO: Integrate actual WalletConnect / SIWE flow
          console.log('WalletConnect — not yet implemented');
        }}
        className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl py-3 font-medium hover:from-blue-600 hover:to-indigo-700 transition-all text-sm flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 11h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" />
        </svg>
        Connect Wallet
      </button>
    </div>
  );
}
