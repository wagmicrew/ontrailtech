import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

interface OnboardingWizardProps {
  user: {
    id: string;
    username: string | null;
    email: string | null;
    wallet_address: string | null;
    avatar_url: string | null;
  };
  onComplete: () => void;
}

const TOTAL_STEPS = 6;

const stepVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export default function OnboardingWizard({ user, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [runnerName, setRunnerName] = useState('');
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameChecking, setNameChecking] = useState(false);
  const [nameClaimed, setNameClaimed] = useState(false);

  // Step 2 state
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  // Step 3 state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Step 5 state
  const [followLoading, setFollowLoading] = useState(false);
  const [followDone, setFollowDone] = useState(false);

  // General
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xl bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 relative"
      >
        {/* Step indicator */}
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step-1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <RunnerNameStep
                runnerName={runnerName}
                setRunnerName={setRunnerName}
                nameAvailable={nameAvailable}
                setNameAvailable={setNameAvailable}
                nameChecking={nameChecking}
                setNameChecking={setNameChecking}
                nameClaimed={nameClaimed}
                setNameClaimed={setNameClaimed}
                error={error}
                setError={setError}
                loading={loading}
                setLoading={setLoading}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step-2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <AvatarStep
                selectedAvatar={selectedAvatar}
                setSelectedAvatar={setSelectedAvatar}
                error={error}
                setError={setError}
                loading={loading}
                setLoading={setLoading}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step-3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <ProfileWalletStep
                walletAddress={walletAddress}
                setWalletAddress={setWalletAddress}
                walletLoading={walletLoading}
                setWalletLoading={setWalletLoading}
                error={error}
                setError={setError}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step-4" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <ExternalWalletStep onNext={nextStep} />
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step-5" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <AutoFollowStep
                followLoading={followLoading}
                setFollowLoading={setFollowLoading}
                followDone={followDone}
                setFollowDone={setFollowDone}
                error={error}
                setError={setError}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 6 && (
            <motion.div key="step-6" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <WelcomeStep
                runnerName={runnerName}
                avatarUrl={selectedAvatar}
                walletAddress={walletAddress}
                loading={loading}
                setLoading={setLoading}
                error={error}
                setError={setError}
                onComplete={onComplete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}


/* ─── Step Indicator ─── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;
        return (
          <div
            key={stepNum}
            className={`h-2 rounded-full transition-all duration-300 ${
              isActive
                ? 'w-8 bg-emerald-500'
                : isCompleted
                  ? 'w-2 bg-emerald-400'
                  : 'w-2 bg-gray-200'
            }`}
          />
        );
      })}
    </div>
  );
}

/* ─── Shared UI helpers ─── */

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

function SecondaryButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return <p className="text-red-500 text-xs mt-1">{message}</p>;
}

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}


/* ─── Step 1: Runner Name ─── */

function RunnerNameStep({
  runnerName, setRunnerName,
  nameAvailable, setNameAvailable,
  nameChecking, setNameChecking,
  nameClaimed, setNameClaimed,
  error, setError,
  loading, setLoading,
  onNext,
}: {
  runnerName: string;
  setRunnerName: (v: string) => void;
  nameAvailable: boolean | null;
  setNameAvailable: (v: boolean | null) => void;
  nameChecking: boolean;
  setNameChecking: (v: boolean) => void;
  nameClaimed: boolean;
  setNameClaimed: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  onNext: () => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAvailability = useCallback((name: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (name.length < 3) {
      setNameAvailable(null);
      return;
    }
    setNameChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.checkUsername(name);
        setNameAvailable(result.available);
        setError('');
      } catch (err: any) {
        setNameAvailable(false);
        setError(err.message || 'Check failed');
      } finally {
        setNameChecking(false);
      }
    }, 300);
  }, [setNameAvailable, setNameChecking, setError]);

  const handleChange = (value: string) => {
    setRunnerName(value);
    setNameClaimed(false);
    setError('');
    checkAvailability(value);
  };

  const handleClaim = async () => {
    setError('');
    setLoading(true);
    try {
      await api.claimIdentity(runnerName);
      setNameClaimed(true);
      onNext();
    } catch (err: any) {
      setError(err.message || 'Failed to claim name');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Choose Your Runner Name</h3>
        <p className="text-sm text-gray-500 mt-1">This will be your unique identity on OnTrail</p>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Enter runner name"
          value={runnerName}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={20}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
        />
        {/* Availability indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {nameChecking && (
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          )}
          {!nameChecking && nameAvailable === true && (
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {!nameChecking && nameAvailable === false && runnerName.length >= 3 && (
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
      </div>

      {/* Preview subdomain */}
      {runnerName.length >= 3 && nameAvailable && (
        <p className="text-xs text-emerald-600 text-center">
          <span className="font-medium">{runnerName.toLowerCase()}.ontrail.tech</span>
        </p>
      )}

      <ErrorMessage message={error} />

      <PrimaryButton
        onClick={handleClaim}
        loading={loading}
        disabled={!nameAvailable || runnerName.length < 3}
      >
        Claim Name
      </PrimaryButton>
    </div>
  );
}


/* ─── Step 2: Avatar Selection ─── */

const AVATAR_OPTIONS = Array.from({ length: 12 }, (_, i) => `/avatars/avatar-${i + 1}.png`);

function AvatarStep({
  selectedAvatar, setSelectedAvatar,
  error, setError,
  loading, setLoading,
  onNext,
}: {
  selectedAvatar: string | null;
  setSelectedAvatar: (v: string | null) => void;
  error: string;
  setError: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  onNext: () => void;
}) {
  const handleContinue = async () => {
    if (!selectedAvatar) return;
    setError('');
    setLoading(true);
    try {
      await api.updateAvatar(selectedAvatar);
      onNext();
    } catch (err: any) {
      setError(err.message || 'Failed to save avatar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Pick Your Avatar</h3>
        <p className="text-sm text-gray-500 mt-1">Choose a look that represents you on the trail</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {AVATAR_OPTIONS.map((url) => (
          <button
            key={url}
            onClick={() => setSelectedAvatar(url)}
            className={`aspect-square rounded-xl border-2 overflow-hidden transition-all hover:scale-105 ${
              selectedAvatar === url
                ? 'border-emerald-500 ring-2 ring-emerald-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <img
              src={url}
              alt="Avatar option"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect fill="#d1fae5" width="80" height="80"/><text x="40" y="48" text-anchor="middle" font-size="28" fill="#10b981">${url.match(/avatar-(\d+)/)?.[1] ?? '?'}</text></svg>`
                )}`;
              }}
            />
          </button>
        ))}
      </div>

      <ErrorMessage message={error} />

      <PrimaryButton onClick={handleContinue} loading={loading} disabled={!selectedAvatar}>
        Continue
      </PrimaryButton>
    </div>
  );
}


/* ─── Step 3: Profile Wallet ─── */

function ProfileWalletStep({
  walletAddress, setWalletAddress,
  walletLoading, setWalletLoading,
  error, setError,
  onNext,
}: {
  walletAddress: string | null;
  setWalletAddress: (v: string | null) => void;
  walletLoading: boolean;
  setWalletLoading: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (walletAddress) return; // already generated
    let cancelled = false;
    async function generate() {
      setWalletLoading(true);
      setError('');
      try {
        const result = await api.createProfileWallet();
        if (!cancelled) setWalletAddress(result.wallet_address);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Wallet creation failed');
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    }
    generate();
    return () => { cancelled = true; };
  }, [walletAddress, setWalletAddress, setWalletLoading, setError]);

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Your Profile Wallet</h3>
        <p className="text-sm text-gray-500 mt-1">This is your OnTrail profile wallet for on-chain interactions</p>
      </div>

      {walletLoading && <Spinner />}

      {walletAddress && (
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Wallet Address</p>
          <p className="text-sm font-mono text-gray-800 break-all">{walletAddress}</p>
        </div>
      )}

      <ErrorMessage message={error} />

      {!walletLoading && error && (
        <SecondaryButton onClick={() => { setWalletAddress(null); setError(''); }}>
          Retry
        </SecondaryButton>
      )}

      <PrimaryButton onClick={onNext} disabled={!walletAddress}>
        Continue
      </PrimaryButton>
    </div>
  );
}


/* ─── Step 4: External Wallet (Optional) ─── */

function ExternalWalletStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Connect External Wallet</h3>
        <p className="text-sm text-gray-500 mt-1">Optionally connect your MetaMask or WalletConnect wallet</p>
      </div>

      <button
        onClick={() => {
          // TODO: Integrate ConnectKit for external wallet connection
          console.log('ConnectKit external wallet — not yet implemented');
        }}
        className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl py-3 font-medium hover:from-blue-600 hover:to-indigo-700 transition-all text-sm flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 11h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" />
        </svg>
        Connect External Wallet
      </button>

      <SecondaryButton onClick={onNext}>
        Skip for Now
      </SecondaryButton>
    </div>
  );
}

/* ─── Step 5: Auto-Follow ─── */

function AutoFollowStep({
  followLoading, setFollowLoading,
  followDone, setFollowDone,
  error, setError,
  onNext,
}: {
  followLoading: boolean;
  setFollowLoading: (v: boolean) => void;
  followDone: boolean;
  setFollowDone: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (followDone) return;
    let cancelled = false;
    async function run() {
      setFollowLoading(true);
      setError('');
      try {
        await api.autoFollow();
        if (!cancelled) {
          setFollowDone(true);
          // Auto-advance after a brief moment
          setTimeout(() => { if (!cancelled) onNext(); }, 1200);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Auto-follow failed');
      } finally {
        if (!cancelled) setFollowLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [followDone, setFollowLoading, setFollowDone, setError, onNext]);

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Setting Up Your Network</h3>
        <p className="text-sm text-gray-500 mt-1">Setting up your social network...</p>
      </div>

      {followLoading && <Spinner />}

      {followDone && (
        <div className="text-center py-4">
          <svg className="w-12 h-12 text-emerald-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-gray-600">You're all connected!</p>
        </div>
      )}

      <ErrorMessage message={error} />

      {!followLoading && error && (
        <SecondaryButton onClick={() => { setFollowDone(false); setError(''); }}>
          Retry
        </SecondaryButton>
      )}
    </div>
  );
}


/* ─── Step 6: Welcome ─── */

function WelcomeStep({
  runnerName, avatarUrl, walletAddress,
  loading, setLoading,
  error, setError,
  onComplete,
}: {
  runnerName: string;
  avatarUrl: string | null;
  walletAddress: string | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  onComplete: () => void;
}) {
  const handleStart = async () => {
    setError('');
    setLoading(true);
    try {
      await api.completeOnboarding();
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-900">Welcome to OnTrail</h3>
        <p className="text-sm text-gray-500 mt-1">You're all set to start exploring</p>
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt="Your avatar"
            className="w-16 h-16 rounded-full border-2 border-emerald-500 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect fill="#d1fae5" width="80" height="80" rx="40"/><text x="40" y="48" text-anchor="middle" font-size="28" fill="#10b981">🏃</text></svg>`
              )}`;
            }}
          />
        )}
        <p className="text-base font-semibold text-gray-900">{runnerName}</p>
        <p className="text-xs text-emerald-600">{runnerName.toLowerCase()}.ontrail.tech</p>
        {walletAddress && (
          <p className="text-xs text-gray-400 font-mono truncate max-w-[280px]">{walletAddress}</p>
        )}
      </div>

      <ErrorMessage message={error} />

      <PrimaryButton onClick={handleStart} loading={loading}>
        Start Exploring
      </PrimaryButton>
    </div>
  );
}
