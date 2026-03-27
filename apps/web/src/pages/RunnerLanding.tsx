import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { resolveRunnerFromSubdomain } from '../lib/subdomain';
import { loadState, saveState } from '../lib/journey';
import ReputationAura, { type AuraLevel } from '../components/ReputationAura';
import { api } from '../lib/api';

// --- Types ---

interface RunnerProfileData {
  id: string;
  username: string;
  avatarUrl: string | null;
  reputationScore: number;
  rank: number;
  tokenStatus: 'bonding_curve' | 'tge_ready' | 'launched';
  friendPass: {
    sold: number;
    maxSupply: number;
    currentPrice: string;
    currentPriceFiat: string;
    nextPrice: string;
  };
  stats: {
    totalSupporters: number;
    totalTips: string;
    tokenProgress: number;
  };
  activityFeed: ActivityFeedItem[];
  auraLevel?: AuraLevel;
}

interface ActivityFeedItem {
  type: 'join' | 'friendpass_buy' | 'tip' | 'rank_up';
  username: string | null;
  amount: string | null;
  timeAgo: string;
}

// --- Placeholder KokonutUI components (TODO: replace with real installs) ---

/** TODO: Replace with `@kokonutui/flow-field` once installed via shadcn registry */
function FlowFieldBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs simulating flow field particles */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" />
      <div
        className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-teal-400/15 rounded-full blur-[100px] animate-pulse"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="absolute -bottom-40 left-1/3 w-[700px] h-[700px] bg-green-500/10 rounded-full blur-[140px] animate-pulse"
        style={{ animationDelay: '4s' }}
      />
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

/** TODO: Replace with `@kokonutui/apple-activity-card` once installed via shadcn registry */
function AppleActivityCard({
  steps,
  reputation,
  tokenActivity,
}: {
  steps: number;
  reputation: number;
  tokenActivity: number;
}) {
  const rings = [
    { label: 'Steps', value: steps, max: 100, color: '#22c55e', size: 120 },
    { label: 'Reputation', value: reputation, max: 100, color: '#f59e0b', size: 90 },
    { label: 'Token Activity', value: tokenActivity, max: 100, color: '#ec4899', size: 60 },
  ];

  return (
    <div className="relative w-36 h-36 mx-auto">
      {rings.map((ring) => {
        const radius = ring.size / 2 - 6;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min(ring.value / ring.max, 1);
        const offset = circumference * (1 - progress);
        return (
          <svg
            key={ring.label}
            className="absolute inset-0 m-auto -rotate-90"
            width={ring.size}
            height={ring.size}
          >
            <circle
              cx={ring.size / 2}
              cy={ring.size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={8}
            />
            <motion.circle
              cx={ring.size / 2}
              cy={ring.size / 2}
              r={radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            />
          </svg>
        );
      })}
    </div>
  );
}


// --- Helper components ---

function RankBadge({ rank }: { rank: number }) {
  const tier =
    rank <= 10
      ? { label: 'Legendary', gradient: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/40' }
      : rank <= 50
        ? { label: 'Epic', gradient: 'from-purple-400 to-pink-500', glow: 'shadow-purple-500/30' }
        : rank <= 200
          ? { label: 'Rare', gradient: 'from-blue-400 to-cyan-500', glow: 'shadow-blue-500/20' }
          : { label: 'Explorer', gradient: 'from-slate-400 to-slate-500', glow: '' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${tier.gradient} shadow-lg ${tier.glow}`}
    >
      #{rank} · {tier.label}
    </span>
  );
}

function RunnerAvatar({
  avatarUrl,
  username,
}: {
  avatarUrl: string | null;
  username: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${username}'s avatar`}
        className="w-20 h-20 rounded-full ring-4 ring-emerald-400/50 shadow-xl shadow-emerald-500/20 object-cover"
      />
    );
  }
  const hue = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="w-20 h-20 rounded-full ring-4 ring-emerald-400/50 shadow-xl shadow-emerald-500/20 flex items-center justify-center text-white text-2xl font-bold"
      style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
    >
      {username[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

function SupplyBar({ sold, maxSupply }: { sold: number; maxSupply: number }) {
  const pct = Math.min((sold / maxSupply) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
        <span>
          {sold}/{maxSupply} positions secured
        </span>
        <span>{Math.round(pct)}% claimed</span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-400 to-green-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
        />
      </div>
    </div>
  );
}

function MomentumMeter({ progress }: { progress: number }) {
  const label =
    progress >= 75 ? 'Near launch' : progress >= 40 ? 'Surging' : 'Building';
  const emoji = progress >= 75 ? '🔥' : progress >= 40 ? '🚀' : '📈';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{emoji}</span>
      <span className="text-slate-300">
        Momentum {label.toLowerCase()} —{' '}
        <span className="text-emerald-400 font-semibold">{progress}% to launch</span>
      </span>
    </div>
  );
}

const FEED_ICONS: Record<ActivityFeedItem['type'], string> = {
  join: '👋',
  friendpass_buy: '💰',
  tip: '⚡',
  rank_up: '🏆',
};

const FEED_LABELS: Record<ActivityFeedItem['type'], (item: ActivityFeedItem) => string> = {
  join: (i) => `${i.username ?? 'Someone'} joined`,
  friendpass_buy: (i) =>
    `${i.username ?? 'Someone'} secured a position${i.amount ? ` for ${i.amount} ETH` : ''}`,
  tip: (i) =>
    `${i.username ?? 'Someone'} boosted${i.amount ? ` ${i.amount} ETH` : ''}`,
  rank_up: (i) => `${i.username ?? 'Someone'} ranked up`,
};

function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 + idx * 0.12 }}
          className="flex items-center gap-2.5 text-sm text-slate-300 bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/5"
        >
          <span className="text-base">{FEED_ICONS[item.type]}</span>
          <span className="flex-1 truncate">{FEED_LABELS[item.type](item)}</span>
          <span className="text-xs text-slate-500 shrink-0">{item.timeAgo}</span>
        </motion.div>
      ))}
    </div>
  );
}


// --- 404 Component ---

function RunnerNotFound({ username }: { username: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="text-6xl mb-6">🏔️</div>
        <h1 className="text-3xl font-bold text-white mb-3">Trail not found</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          We couldn't find a runner named{' '}
          <span className="text-emerald-400 font-semibold">{username}</span>. They
          might not have claimed their trail yet.
        </p>
        <a
          href="https://app.ontrail.tech/explore"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-400 text-white px-6 py-3 rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5"
        >
          Explore other runners →
        </a>
      </motion.div>
    </div>
  );
}

// --- Reservation Overlay (Req 2.1) ---

function ReservationOverlay() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6"
      >
        <motion.span
          className="text-6xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          🔥
        </motion.span>
        <motion.p
          className="text-2xl font-bold text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Reserving your spot...
        </motion.p>
        <motion.div
          className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-400 to-green-400 rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// --- Main Component ---

export interface RunnerLandingProps {
  /** Override hostname for testing; defaults to window.location.hostname */
  hostname?: string;
}

export default function RunnerLanding({ hostname }: RunnerLandingProps) {
  const resolvedUsername = useMemo(
    () => resolveRunnerFromSubdomain(hostname ?? window.location.hostname),
    [hostname],
  );

  const [profile, setProfile] = useState<RunnerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reserving, setReserving] = useState(false);

  const { login, isConnected: authenticated } = useAuth();

  // Soft commitment CTA handler (Req 2.1, 2.2)
  const handleSecurePosition = useCallback(() => {
    setReserving(true);

    // Persist softCommitted flag to journey state (Req 2.2)
    const existing = loadState();
    const updated = existing
      ? { ...existing, softCommitted: true }
      : {
          phase: 'landing' as const,
          runnerUsername: resolvedUsername ?? '',
          userId: null,
          friendPassId: null,
          referrerUsername: null,
          claimedUsername: null,
          completedPhases: [],
          softCommitted: true,
        };
    saveState(updated);

    // Show animation for 1.5s, then open Privy auth (Req 2.1)
    setTimeout(() => {
      setReserving(false);
      login();
    }, 1500);
  }, [resolvedUsername, login]);

  // Auto-prompt auth on return visit with softCommitted flag (Req 2.3)
  useEffect(() => {
    if (authenticated) return;
    const journeyState = loadState();
    if (journeyState?.softCommitted && !authenticated) {
      login();
    }
  }, [authenticated, login]);

  // Store ?ref= query param in localStorage on mount (Req 1.8)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        localStorage.setItem('ontrail_referrer', ref);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Fetch runner profile data (Req 1.3, 1.5)
  useEffect(() => {
    if (!resolvedUsername) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      try {
        const data = await api.getRunner(resolvedUsername!);
        if (!cancelled) {
          setProfile(data as RunnerProfileData);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [resolvedUsername]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-3 border-emerald-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // --- 404 state (Req 1.9) ---
  if (notFound || !profile) {
    return <RunnerNotFound username={resolvedUsername ?? 'unknown'} />;
  }

  const { friendPass, stats, activityFeed } = profile;
  const recentCount = activityFeed.filter(
    (i) => i.type === 'join' || i.type === 'friendpass_buy',
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Reservation overlay (Req 2.1) */}
      <AnimatePresence>
        {reserving && <ReservationOverlay />}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          HERO SECTION — Full viewport, dark gradient, FlowField bg
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        <FlowFieldBackground />

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
          {/* OnTrail logo */}
          <motion.img
            src="/ontrail-logo.png"
            alt="OnTrail"
            className="h-8 md:h-10 mb-8 brightness-0 invert opacity-80"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ duration: 0.6 }}
          />

          {/* Runner avatar + rank */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col items-center gap-3 mb-6"
          >
            <RunnerAvatar avatarUrl={profile.avatarUrl} username={profile.username} />
            <RankBadge rank={profile.rank} />
          </motion.div>

          {/* Runner name headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-3"
          >
            <span className="bg-gradient-to-r from-emerald-300 via-green-200 to-teal-300 bg-clip-text text-transparent">
              {profile.username}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-slate-400 text-lg mb-6"
          >
            {profile.username}.ontrail.tech · {stats.totalSupporters} supporters
          </motion.p>

          {/* Reputation rings with fluid aura visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-8 flex flex-col items-center"
          >
            <ReputationAura
              auraLevel={profile.auraLevel ?? 'None'}
              reputation={Math.min(profile.reputationScore, 100)}
              size={144}
              auraSpread={40}
            >
              <AppleActivityCard
                steps={Math.min(profile.reputationScore, 100)}
                reputation={Math.min(profile.reputationScore, 100)}
                tokenActivity={stats.tokenProgress}
              />
            </ReputationAura>
            <div className="flex justify-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Steps
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Reputation
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-pink-500" /> Token
              </span>
            </div>
          </motion.div>

          {/* FriendPass supply bar (Req 1.6) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="w-full max-w-sm mb-4"
          >
            <SupplyBar sold={friendPass.sold} maxSupply={friendPass.maxSupply} />
          </motion.div>

          {/* Price + momentum (Req 1.6) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col items-center gap-2 mb-8"
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="text-white font-semibold">
                {friendPass.currentPrice} ETH
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{friendPass.currentPriceFiat}</span>
              <span className="text-slate-500">·</span>
              <span className="text-xs text-slate-500">
                Next: {friendPass.nextPrice} ETH
              </span>
            </div>
            <MomentumMeter progress={stats.tokenProgress} />
          </motion.div>

          {/* CTA — Positioning language (Req 2.4) */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            onClick={handleSecurePosition}
            className="group relative bg-gradient-to-r from-emerald-500 to-green-400 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-1 mb-4"
          >
            <span className="relative z-10">Secure your position</span>
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-green-300 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
            className="text-xs text-slate-500"
          >
            Price increases after each position · Get in early
          </motion.p>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center pt-2"
          >
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SOCIAL PROOF — Activity feed (Req 1.7)
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-b from-slate-950 to-slate-900 px-6 py-16 md:py-24">
        <div className="max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Live activity
            </h2>
            {recentCount > 0 && (
              <p className="text-sm text-slate-400">
                🔥 {recentCount} {recentCount === 1 ? 'person' : 'people'} joined
                recently
              </p>
            )}
          </motion.div>

          <ActivityFeed items={activityFeed} />

          {/* Repeat CTA below the fold */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-center mt-10"
          >
            <button
              onClick={handleSecurePosition}
              className="bg-gradient-to-r from-emerald-500 to-green-400 text-white px-6 py-3 rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5">
              Secure your position
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
