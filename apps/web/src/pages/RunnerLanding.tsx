import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { resolveRunnerFromSubdomain } from '../lib/subdomain';
import ReputationAura, { type AuraLevel } from '../components/ReputationAura';
import AuraIndicator from '../components/AuraIndicator';
import AuraRings from '../components/AuraRings';
import { api } from '../lib/api';

// --- Types ---

type ViewerState = 'guest' | 'friend' | 'owner';

interface ViewerRelationship {
  state: ViewerState;
  is_authenticated: boolean;
  is_friendpass_holder: boolean;
  friendpass_count: number;
  can_buy_friendpass: boolean;
  can_sell_friendpass: boolean;
}

interface TeaserContent {
  locked_pois_count: number;
  locked_routes_count: number;
  locked_messages_count: number;
  has_bonding_curve: boolean;
}

interface UnlockedContent {
  pois: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    rarity: string;
  }>;
  routes: Array<{
    id: string;
    name: string;
    difficulty: string;
    distance_km: number;
  }>;
  messages: Array<{
    id: string;
    text: string;
    created_at: string;
  }>;
  bonding_curve_visible: boolean;
  friendpass_holders: Array<{
    owner_id: string;
    username: string | null;
    avatar_url: string | null;
    passes: number;
    purchased_at: string;
  }>;
}

interface RunnerProfileData {
  id: string;
  username: string;
  avatarUrl: string | null;
  headerImageUrl?: string | null;
  bio?: string | null;
  wallet_address?: string | null;
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
  is_boosted?: boolean;
  is_golden_boosted?: boolean;
  boost_expires_at?: string | null;
  poi_count?: number;
  route_count?: number;
  auraLevel?: AuraLevel;
  ancientSupporterCount?: number;
  totalAura?: string;
  // Three-state profile system
  viewer: ViewerRelationship;
  teaser: TeaserContent;
  unlocked: UnlockedContent;
}

interface BoostResult {
  boost_pct: number;
  is_golden: boolean;
  boost_until: string;
  message: string;
}

interface ActivityFeedItem {
  type: 'join' | 'friendpass_buy' | 'tip' | 'rank_up';
  username: string | null;
  amount: string | null;
  timeAgo: string;
}

// --- Rank badge ---

function RankBadge({ rank }: { rank: number }) {
  const tier =
    rank <= 10
      ? { label: 'Legendary', gradient: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/40' }
      : rank <= 50
        ? { label: 'Epic', gradient: 'from-purple-400 to-pink-500', glow: 'shadow-purple-500/30' }
        : rank <= 200
          ? { label: 'Rare', gradient: 'from-blue-400 to-cyan-500', glow: 'shadow-blue-500/20' }
          : { label: 'Explorer', gradient: 'from-emerald-400 to-green-500', glow: '' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${tier.gradient} shadow-lg ${tier.glow}`}
    >
      #{rank} · {tier.label}
    </span>
  );
}

// --- Activity rings ---

function ActivityRings({ reputation, poiCount, tokenProgress }: { reputation: number; poiCount: number; tokenProgress: number }) {
  const rep = Math.min((reputation / 100) * 100, 100);
  const poi = Math.min((poiCount * 5), 100);
  const tok = Math.min(tokenProgress, 100);

  function ring(size: number, color: string, pct: number, label: string, value: string) {
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
      <g>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={10} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
        />
        <title>{label}: {value}</title>
      </g>
    );
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 144, height: 144 }}>
      <svg width={144} height={144} className="absolute inset-0">
        {ring(144, '#22c55e', rep, 'Reputation', `${Math.round(reputation)}`)}
      </svg>
      <svg width={108} height={108} className="absolute" style={{ top: 18, left: 18 }}>
        {ring(108, '#f59e0b', poi, 'POIs', `${poiCount}`)}
      </svg>
      <svg width={72} height={72} className="absolute" style={{ top: 36, left: 36 }}>
        {ring(72, '#ec4899', tok, 'Token', `${tokenProgress}%`)}
      </svg>
      <div className="flex flex-col items-center justify-center z-10">
        <span className="text-lg font-extrabold text-slate-800 leading-none">{Math.round(reputation)}</span>
        <span className="text-[10px] text-slate-400">REP</span>
      </div>
    </div>
  );
}

// --- Runner avatar ---

function RunnerAvatar({ avatarUrl, username, size = 96, isBoosted = false, isGolden = false }: { avatarUrl: string | null; username: string; size?: number; isBoosted?: boolean; isGolden?: boolean }) {
  const hue = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const style: React.CSSProperties = { width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 };

  const auraAnimation = isGolden
    ? {
        boxShadow: [
          '0 0 30px rgba(251,191,36,0.7), 0 0 0 2px rgba(251,191,36,0.5)',
          '0 0 60px rgba(251,191,36,0.95), 0 0 90px rgba(251,191,36,0.4), 0 0 0 3px rgba(251,191,36,0.8)',
          '0 0 30px rgba(251,191,36,0.7), 0 0 0 2px rgba(251,191,36,0.5)',
        ],
      }
    : isBoosted
      ? { boxShadow: '0 0 50px rgba(34,197,94,0.7), 0 0 90px rgba(34,197,94,0.3), 0 0 0 3px rgba(34,197,94,0.5)' }
      : { boxShadow: '0 0 20px rgba(34,197,94,0.15), 0 0 0 2px rgba(34,197,94,0.1)' };

  const auraTransition = isGolden
    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' as const }
    : { duration: 0.5 };

  const inner = avatarUrl
    ? <img src={avatarUrl} alt={`${username}'s avatar`} className="w-full h-full object-cover" />
    : (
      <div
        style={{ width: size, height: size, backgroundColor: `hsl(${hue}, 60%, 45%)` }}
        className="flex items-center justify-center text-white font-bold text-3xl"
      >
        {username[0]?.toUpperCase() ?? '?'}
      </div>
    );

  return (
    <motion.div style={{ ...style }} animate={auraAnimation} transition={auraTransition}>
      {inner}
    </motion.div>
  );
}

// --- Supply bar ---

function SupplyBar({ sold, maxSupply }: { sold: number; maxSupply: number }) {
  const pct = Math.min((sold / maxSupply) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>{sold}/{maxSupply} positions</span>
        <span>{Math.round(pct)}% claimed</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-400 to-green-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
        />
      </div>
    </div>
  );
}

// --- Activity feed ---

const FEED_ICONS: Record<ActivityFeedItem['type'], string> = {
  join: '👋',
  friendpass_buy: '💰',
  tip: '⚡',
  rank_up: '🏆',
};

const FEED_LABELS: Record<ActivityFeedItem['type'], (item: ActivityFeedItem) => string> = {
  join: (i) => `${i.username ?? 'Someone'} joined the trail`,
  friendpass_buy: (i) =>
    `${i.username ?? 'Someone'} secured a position${i.amount ? ` · ${i.amount} ETH` : ''}`,
  tip: (i) => `${i.username ?? 'Someone'} boosted${i.amount ? ` · ${i.amount} ETH` : ''}`,
  rank_up: (i) => `${i.username ?? 'Someone'} ranked up`,
};

function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-6">
        No activity yet — be the first.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 + idx * 0.07 }}
          className="flex items-center gap-3 text-sm bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100"
        >
          <span className="text-base">{FEED_ICONS[item.type]}</span>
          <span className="flex-1 text-slate-700 truncate">{FEED_LABELS[item.type](item)}</span>
          <span className="text-xs text-slate-400 shrink-0">{item.timeAgo}</span>
        </motion.div>
      ))}
    </div>
  );
}

// --- Stat pill ---

function StatPill({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-3">
      <span className="text-lg">{icon}</span>
      <span className="text-base font-bold text-slate-900">{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

// --- Token status badge ---

function TokenStatusBadge({ status }: { status: string }) {
  const cfg = status === 'launched'
    ? { label: '🚀 Token live', bg: 'bg-emerald-100 text-emerald-700' }
    : status === 'tge_ready'
      ? { label: '⚡ TGE ready', bg: 'bg-amber-100 text-amber-700' }
      : { label: '📈 Bonding curve', bg: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// --- 404 ---

function RunnerNotFound({ username }: { username: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="text-6xl mb-6">🏔️</div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Trail not found</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          We couldn't find a runner named{' '}
          <span className="text-emerald-600 font-semibold">{username}</span>. They
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

// --- Join panel (pre-onboarding overlay for guests) ---

function JoinPanel({ username, onSignIn, onClose }: { username: string; onSignIn: () => void; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 z-10"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-2xl shadow-lg shadow-emerald-200">
            🏃
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Join {username}'s trail</h2>
            <p className="text-sm text-slate-500">Get early access before positions fill up</p>
          </div>
        </div>

        <ul className="space-y-3 mb-8">
          {[
            { icon: '💰', title: 'Secure a FriendPass', desc: `Own a position on ${username}'s trail — price rises with each sale` },
            { icon: '🚀', title: 'Earn when they launch', desc: 'FriendPass holders benefit when the runner reaches their Token Generation Event' },
            { icon: '🏔️', title: 'Build your own trail', desc: 'Claim your username and start earning from your runs' },
          ].map((v) => (
            <li key={v.title} className="flex gap-3">
              <span className="text-xl shrink-0 mt-0.5">{v.icon}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{v.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{v.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <button
            onClick={onSignIn}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-3 rounded-2xl font-semibold shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all hover:-translate-y-0.5"
          >
            Create my account
          </button>
          <button
            onClick={onSignIn}
            className="w-full bg-slate-100 text-slate-700 py-3 rounded-2xl font-semibold hover:bg-slate-200 transition-colors"
          >
            I already have an account
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Free to join · Web3 & email options available
        </p>
      </motion.div>
    </motion.div>
  );
}

// --- Main component ---

export interface RunnerLandingProps {
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
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [boostResult, setBoostResult] = useState<BoostResult | null>(null);
  const [boostLoading, setBoostLoading] = useState(false);

  const { login, isLoading: authLoading } = useAuth();

  // Three-state profile system from API
  const viewerState = profile?.viewer.state ?? 'guest';
  const isGuest = viewerState === 'guest';
  const isFriend = viewerState === 'friend';
  const isOwner = viewerState === 'owner';

  const handleCTA = useCallback(() => {
    setShowJoinPanel(true);
  }, []);

  const handleSignIn = useCallback(() => {
    setShowJoinPanel(false);
    login();
  }, [login]);

  const handleBoost = useCallback(async () => {
    if (!resolvedUsername || boostLoading) return;
    setBoostLoading(true);
    try {
      const result = await (api as any).boostRunner(resolvedUsername);
      setBoostResult(result as BoostResult);
      setTimeout(() => setBoostResult(null), 6000);
    } catch { /* ignore */ } finally {
      setBoostLoading(false);
    }
  }, [resolvedUsername, boostLoading]);

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) localStorage.setItem('ontrail_referrer', ref);
    } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => {
    if (!resolvedUsername) { setLoading(false); setNotFound(true); return; }
    let cancelled = false;
    api.getRunner(resolvedUsername)
      .then((data) => { if (!cancelled) { setProfile(data as RunnerProfileData); setLoading(false); } })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [resolvedUsername]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-[3px] border-emerald-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (notFound || !profile) {
    return <RunnerNotFound username={resolvedUsername ?? 'unknown'} />;
  }

  const { friendPass, stats, activityFeed } = profile;
  const isGolden = (profile?.is_golden_boosted || boostResult?.is_golden) ?? false;
  const isBoosted = (profile?.is_boosted || boostResult != null) ?? false;
  const auraLevel: AuraLevel = (profile.auraLevel as AuraLevel) ?? 'None';

  return (
    <div className="min-h-screen bg-slate-50">
      <AnimatePresence>
        {showJoinPanel && (
          <JoinPanel
            username={profile.username}
            onSignIn={handleSignIn}
            onClose={() => setShowJoinPanel(false)}
          />
        )}
      </AnimatePresence>

      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-4 sm:px-6 h-14">
        <a href="https://ontrail.tech" className="flex items-center gap-2">
          <img src="/ontrail-logo.png" alt="OnTrail" className="h-6 opacity-85" />
        </a>
        <div className="flex items-center gap-2">
          {/* State badge */}
          {isFriend && (
            <span className="text-xs text-violet-600 font-medium bg-violet-50 px-3 py-1 rounded-full border border-violet-200">
              ✓ FriendPass Holder
            </span>
          )}
          {isOwner && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              👑 Owner
            </span>
          )}
          {isGuest && profile?.viewer.is_authenticated ? (
            <span className="text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
              Visitor
            </span>
          ) : null}
          {isGuest && !profile?.viewer.is_authenticated ? (
            <button
              onClick={handleSignIn}
              className="text-xs font-semibold text-slate-600 hover:text-emerald-600 transition-colors"
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      {/* Cover banner */}
      <div className="relative h-36 sm:h-48 bg-gradient-to-br from-emerald-400 via-green-300 to-teal-400 overflow-hidden">
        <div className="absolute -top-10 -left-10 w-56 h-56 bg-white/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 right-10 w-40 h-40 bg-emerald-600/25 rounded-full blur-2xl" />
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Avatar row */}
        <div className="relative -mt-14 mb-4 flex items-end justify-between">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="ring-4 ring-white rounded-full shadow-xl"
          >
            <ReputationAura auraLevel={auraLevel} reputation={Math.min(profile.reputationScore, 100)} size={96} auraSpread={28}>
              <RunnerAvatar avatarUrl={profile.avatarUrl} username={profile.username} size={96} isBoosted={isBoosted} isGolden={isGolden} />
            </ReputationAura>
          </motion.div>

          <div className="flex items-center gap-2 mb-1">
            {/* Round boost button */}
            <div className="relative flex flex-col items-center gap-1">
              <motion.button
                onClick={handleBoost}
                disabled={boostLoading}
                whileTap={{ scale: 0.92 }}
                className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-white shadow-lg shadow-amber-300/50 flex flex-col items-center justify-center text-lg disabled:opacity-60"
                aria-label="Boost this runner"
              >
                <motion.span
                  className="absolute inset-0 rounded-full bg-amber-400/40"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="relative z-10 text-xl">⚡</span>
                <span className="relative z-10 text-[10px] font-bold leading-none">Boost</span>
              </motion.button>
            </div>

            {/* Three-state action buttons */}
            {isOwner ? (
              <a
                href="https://app.ontrail.tech/profile"
                className="border border-slate-300 text-slate-700 px-5 py-2 rounded-xl font-semibold text-sm hover:border-slate-400 transition-colors bg-white"
              >
                Edit profile
              </a>
            ) : isFriend ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCTA}
                  className="bg-gradient-to-r from-violet-500 to-purple-400 text-white px-5 py-2 rounded-xl font-semibold text-sm shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all hover:-translate-y-0.5"
                >
                  Buy More
                </button>
                {profile.viewer.can_sell_friendpass && (
                  <button
                    onClick={handleCTA}
                    className="border border-slate-300 text-slate-600 px-3 py-2 rounded-xl font-semibold text-sm hover:border-slate-400 transition-colors bg-white"
                  >
                    Sell
                  </button>
                )}
              </div>
            ) : isGuest ? (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={handleCTA}
                className="bg-gradient-to-r from-emerald-500 to-green-400 text-white px-5 py-2 rounded-xl font-semibold text-sm shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all hover:-translate-y-0.5"
              >
                Get FriendPass
              </motion.button>
            ) : null}
          </div>
        </div>

        {/* Name + badges */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-extrabold text-slate-900">{profile.username}</h1>
            <RankBadge rank={profile.rank} />
            <TokenStatusBadge status={profile.tokenStatus} />
          </div>
          <p className="text-sm text-slate-400 mb-3">{profile.username}.ontrail.tech</p>
        </motion.div>

        {/* Aura indicator */}
        {profile.id && (
          <div className="mb-3">
            <AuraIndicator runnerId={profile.id}>
              {null}
            </AuraIndicator>
          </div>
        )}

        {/* Golden boost badge + toast */}
        <AnimatePresence>
          {boostResult && (
            <motion.div
              key="boost-toast"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mb-3 flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-md ${boostResult.is_golden ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}
            >
              <span className="text-lg">{boostResult.is_golden ? '🌟' : '⚡'}</span>
              <span className="flex-1">{boostResult.message}</span>
              <span className="text-xs opacity-70">+{boostResult.boost_pct}%</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 flex divide-x divide-slate-100"
        >
          <StatPill label="Supporters" value={stats.totalSupporters} icon="👥" />
          <StatPill label="Tips ETH" value={parseFloat(stats.totalTips).toFixed(4)} icon="⚡" />
          <StatPill label="Reputation" value={Math.round(profile.reputationScore)} icon="⭐" />
          <StatPill label="To launch" value={`${stats.tokenProgress}%`} icon="🚀" />
        </motion.div>

        {/* FriendPass card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900">FriendPass</h2>
            <span className="text-xs text-slate-500">Price rises with each sale</span>
          </div>

          <SupplyBar sold={friendPass.sold} maxSupply={friendPass.maxSupply} />

          <div className="flex items-center gap-3 mt-3 mb-4 text-sm">
            <span className="font-semibold text-slate-900">{friendPass.currentPrice} ETH</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{friendPass.currentPriceFiat}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">Next: {friendPass.nextPrice} ETH</span>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>🚀 Token launch progress</span>
              <span>{stats.tokenProgress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stats.tokenProgress}%` }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.5 }}
              />
            </div>
          </div>

          {isOwner ? (
            <a
              href="https://app.ontrail.tech/profile"
              className="block w-full text-center bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
            >
              Manage in Dashboard
            </a>
          ) : isFriend ? (
            <div className="flex gap-2">
              <button
                onClick={handleCTA}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-400 text-white py-3 rounded-xl font-semibold shadow-md shadow-violet-100 hover:shadow-violet-200 transition-all hover:-translate-y-0.5"
              >
                Buy More · {friendPass.currentPrice} ETH
              </button>
              {profile.viewer.can_sell_friendpass && (
                <button
                  onClick={handleCTA}
                  className="px-4 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
                >
                  Sell
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleCTA}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-3 rounded-xl font-semibold shadow-md shadow-emerald-100 hover:shadow-emerald-200 transition-all hover:-translate-y-0.5"
            >
              Secure a position · {friendPass.currentPrice} ETH
            </button>
          )}
        </motion.div>

        {/* Activity rings */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
        >
          <h2 className="font-bold text-slate-900 mb-4">Activity rings</h2>
          <div className="flex flex-col items-center gap-4">
            {isGolden && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 text-white text-xs font-bold shadow-md shadow-amber-200"
              >
                🌟 Golden Boost Active
              </motion.div>
            )}
            <div className="relative">
              <AuraRings auraLevel={auraLevel} size={144} />
              <ActivityRings
                reputation={profile.reputationScore}
                poiCount={profile.poi_count ?? 0}
                tokenProgress={stats.tokenProgress}
              />
            </div>
            <div className="flex gap-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Reputation</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />POIs</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />Token</span>
            </div>
          </div>
        </motion.div>

        {/* Activity feed */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
        >
          <h2 className="font-bold text-slate-900 mb-4">Live activity</h2>
          <ActivityFeed items={activityFeed} />
        </motion.div>

        {/* === GUEST TEASER SECTION === */}
        {isGuest && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 shadow-sm p-5 mb-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900">🔒 Unlock {profile.username}'s Trail</h2>
              <span className="text-xs text-slate-500">FriendPass Required</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                <span className="text-2xl">📍</span>
                <p className="text-lg font-bold text-slate-700">{profile.teaser.locked_pois_count}</p>
                <p className="text-xs text-slate-500">Hidden POIs</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                <span className="text-2xl">🗺️</span>
                <p className="text-lg font-bold text-slate-700">{profile.teaser.locked_routes_count}</p>
                <p className="text-xs text-slate-500">Secret Routes</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-slate-200">
                <span className="text-2xl">💬</span>
                <p className="text-lg font-bold text-slate-700">{profile.teaser.locked_messages_count}+</p>
                <p className="text-xs text-slate-500">Messages</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Buy a FriendPass to unlock exclusive content and see {profile.username}'s hidden trails, POIs, and private messages.
            </p>
            <button
              onClick={handleCTA}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-3 rounded-xl font-semibold shadow-md shadow-emerald-100 hover:shadow-emerald-200 transition-all hover:-translate-y-0.5"
            >
              Unlock for {friendPass.currentPrice} ETH →
            </button>
          </motion.div>
        )}

        {/* === FRIEND UNLOCKED CONTENT === */}
        {(isFriend || isOwner) && profile.unlocked.friendpass_holders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
          >
            <h2 className="font-bold text-slate-900 mb-4">🤝 FriendPass Holders</h2>
            <div className="space-y-3">
              {profile.unlocked.friendpass_holders.slice(0, 5).map((holder, idx) => (
                <div key={holder.owner_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold">
                    {holder.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{holder.username || 'Anonymous'}</p>
                    <p className="text-xs text-slate-500">{holder.passes} pass{holder.passes !== 1 ? 'es' : ''}</p>
                  </div>
                  <span className="text-xs text-slate-400">#{idx + 1}</span>
                </div>
              ))}
            </div>
            {profile.unlocked.friendpass_holders.length > 5 && (
              <p className="text-xs text-slate-500 text-center mt-3">
                +{profile.unlocked.friendpass_holders.length - 5} more holders
              </p>
            )}
          </motion.div>
        )}

        {/* === FRIEND/OWNER UNLOCKED POIs === */}
        {(isFriend || isOwner) && profile.unlocked.pois.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
          >
            <h2 className="font-bold text-slate-900 mb-4">📍 Unlocked POIs</h2>
            <div className="space-y-3">
              {profile.unlocked.pois.map((poi) => (
                <div key={poi.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-2xl">
                    {poi.rarity === 'legendary' ? '👑' : poi.rarity === 'epic' ? '💎' : poi.rarity === 'rare' ? '🏆' : '📍'}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{poi.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{poi.rarity} POI</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* === FRIEND/OWNER UNLOCKED ROUTES === */}
        {(isFriend || isOwner) && profile.unlocked.routes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4"
          >
            <h2 className="font-bold text-slate-900 mb-4">🗺️ Exclusive Routes</h2>
            <div className="space-y-3">
              {profile.unlocked.routes.map((route) => (
                <div key={route.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-2xl">🏃</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{route.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{route.difficulty} • {route.distance_km}km</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* === OWNER ADMIN CONTROLS === */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.46 }}
            className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-sm p-5 mb-28"
          >
            <h2 className="font-bold text-slate-900 mb-4">👑 Owner Controls</h2>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="https://app.ontrail.tech/profile"
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-amber-200 hover:border-amber-300 transition-colors"
              >
                <span className="text-2xl">✏️</span>
                <span className="text-sm font-semibold text-slate-700">Edit Profile</span>
              </a>
              <a
                href="https://app.ontrail.tech/profile?tab=wallets"
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-amber-200 hover:border-amber-300 transition-colors"
              >
                <span className="text-2xl">👛</span>
                <span className="text-sm font-semibold text-slate-700">Manage Wallets</span>
              </a>
              <a
                href="https://app.ontrail.tech/profile?tab=store"
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-amber-200 hover:border-amber-300 transition-colors"
              >
                <span className="text-2xl">🛒</span>
                <span className="text-sm font-semibold text-slate-700">Store</span>
              </a>
              <button
                onClick={handleCTA}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-amber-200 hover:border-amber-300 transition-colors"
              >
                <span className="text-2xl">💬</span>
                <span className="text-sm font-semibold text-slate-700">Add Message</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Spacer for fixed bottom CTA */}
        {isGuest && <div className="h-24" />}
      </div>

      {/* === STICKY BOTTOM CTA === */}
      {/* Guest CTA */}
      {isGuest && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, type: 'spring', damping: 20, stiffness: 180 }}
          className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-2xl px-4 py-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">Support {profile.username}</p>
            <p className="text-xs text-slate-500">FriendPass · {friendPass.currentPrice} ETH · {friendPass.sold}/{friendPass.maxSupply} taken</p>
          </div>
          <button
            onClick={handleCTA}
            className="shrink-0 bg-gradient-to-r from-emerald-500 to-green-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all hover:-translate-y-0.5"
          >
            Join OnTrail →
          </button>
        </motion.div>
      )}

      {/* Friend CTA */}
      {isFriend && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, type: 'spring', damping: 20, stiffness: 180 }}
          className="fixed bottom-0 inset-x-0 z-30 bg-violet-50/95 backdrop-blur-md border-t border-violet-200 shadow-2xl px-4 py-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-violet-900 truncate">You're a FriendPass Holder!</p>
            <p className="text-xs text-violet-600">{profile.viewer.friendpass_count} pass{profile.viewer.friendpass_count !== 1 ? 'es' : ''} · Exclusive access unlocked</p>
          </div>
          <button
            onClick={handleCTA}
            className="shrink-0 bg-gradient-to-r from-violet-500 to-purple-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all hover:-translate-y-0.5"
          >
            Buy More →
          </button>
        </motion.div>
      )}
    </div>
  );
}
