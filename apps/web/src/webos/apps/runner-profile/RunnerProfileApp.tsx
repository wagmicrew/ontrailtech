import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../core/theme-store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TGEBreakdown {
  [group: string]: { pct: number; tokens: number };
}

interface FullRunnerProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  header_image_url: string | null;
  bio: string | null;
  location: string | null;
  reputation_score: number;
  rank: number;
  is_owner: boolean;
  global_valuation: {
    eth: string;
    usd: string;
    token_market_cap_eth: string;
    friendpass_market_cap_eth: string;
  };
  token: {
    current_supply: number;
    current_price_eth: string;
    current_price_usd: string;
    liquidity_pool_eth: string;
    tge_threshold_eth: string;
    tge_progress_pct: number;
    bonding_curve_type: string;
    tge_breakdown: TGEBreakdown;
    tge_total_supply: number;
  };
  friendpass: {
    current_price_eth: string;
    current_price_usd: string;
    passes_sold: number;
    max_supply: number;
    holder_count: number;
  };
  viewer_friendpass: {
    is_friend: boolean;
    holding_id: string | null;
    passes: number;
  } | null;
  pois: Array<{
    id: string;
    name: string;
    rarity: string;
    latitude: number;
    longitude: number;
    locked: boolean;
    description?: string;
  }>;
  pois_total: number;
  pois_locked_count: number;
  routes: Array<{
    id: string;
    name: string;
    difficulty: string;
    distance_km: number | null;
    completion_count: number;
    locked: boolean;
    description?: string;
    elevation_gain_m?: number;
  }>;
  routes_total: number;
  routes_locked_count: number;
  content_locked: boolean;
  owner_data: {
    friendpass_holders: Array<{
      owner_id: string;
      username: string | null;
      avatar_url: string | null;
      passes: number;
      since: string | null;
    }>;
    top_tippers: Array<{
      owner_id: string;
      username: string | null;
      avatar_url: string | null;
      total_tipped_eth: string;
    }>;
    token_supply: number;
    liquidity_pool_eth: string;
  } | null;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Avatar({ url, username, size = 36 }: { url?: string | null; username?: string | null; size?: number }) {
  const initials = (username || '?').slice(0, 2).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={username || ''}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 text-white font-bold flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

const RARITY_COLORS: Record<string, string> = {
  legendary: '#f59e0b',
  epic: '#8b5cf6',
  rare: '#3b82f6',
  uncommon: '#10b981',
  common: '#6b7280',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#10b981',
  moderate: '#f59e0b',
  hard: '#ef4444',
  extreme: '#7c3aed',
};

const GROUP_COLORS: Record<string, string> = {
  runner: '#8b5cf6',
  friends: '#10b981',
  tippers: '#f59e0b',
  founders: '#3b82f6',
  ancient: '#f97316',
  dao: '#06b6d4',
  site: '#6b7280',
};

function ProgressBar({ pct, color = '#8b5cf6' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
      <div
        className="h-3 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center bg-white/5 rounded-xl p-3 gap-0.5">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-base font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

// ── RunnerProfileApp ──────────────────────────────────────────────────────────

interface RunnerProfileAppProps {
  username?: string;
}

export default function RunnerProfileApp({ username: propUsername }: RunnerProfileAppProps) {
  const { isConnected, userId } = useAuth();
  const theme = useTheme();
  const [searchInput, setSearchInput] = useState(propUsername || '');
  const [loadedUsername, setLoadedUsername] = useState(propUsername || '');
  const [profile, setProfile] = useState<FullRunnerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'pois' | 'routes' | 'economy'>('overview');
  const [buyingPass, setBuyingPass] = useState(false);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);

  const loadProfile = useCallback(async (uname: string) => {
    const clean = uname.trim().toLowerCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFullRunnerProfile(clean);
      setProfile(data);
      setLoadedUsername(clean);
    } catch (e: any) {
      setError(e?.message || 'Failed to load runner profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (propUsername) loadProfile(propUsername);
  }, [propUsername, loadProfile]);

  const handleBuyFriendPass = async () => {
    if (!isConnected || !profile) return;
    setBuyingPass(true);
    setBuyMsg(null);
    try {
      await api.buyFriendPass(profile.id);
      setBuyMsg('FriendPass purchased! You are now a friend 🎉');
      await loadProfile(loadedUsername);
    } catch (e: any) {
      setBuyMsg(e?.message || 'Purchase failed');
    } finally {
      setBuyingPass(false);
    }
  };

  // ── Render ──

  const isDark = theme.scrollbar === 'dark';
  const surface = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMain = isDark ? 'text-white' : 'text-gray-900';

  // ── Search bar (no profile loaded) ──
  const renderSearch = () => (
    <div className={`flex flex-col items-center justify-center h-full gap-4 ${surface}`}>
      <div className="text-4xl">👤</div>
      <p className={`text-lg font-semibold ${textMain}`}>Runner Profile</p>
      <p className={`text-sm ${muted}`}>Enter a runner username to view their profile</p>
      <form
        className="flex gap-2 w-64"
        onSubmit={(e) => { e.preventDefault(); loadProfile(searchInput); }}
      >
        <input
          className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${card} ${textMain}`}
          placeholder="username"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button
          type="submit"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Load
        </button>
      </form>
    </div>
  );

  if (!loadedUsername && !loading) return renderSearch();

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${surface}`}>
        <div className="text-purple-400 animate-pulse text-lg">Loading profile…</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={`flex flex-col items-center justify-center h-full gap-3 ${surface}`}>
        <div className="text-red-400">{error || 'Profile not found'}</div>
        {renderSearch()}
      </div>
    );
  }

  const isFriend = profile.viewer_friendpass?.is_friend;
  const isOwner = profile.is_owner;
  const tgeDistribution = profile.token.tge_breakdown;
  const tgeTotalSupply = profile.token.tge_total_supply;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'pois', label: `POIs (${profile.pois_total})` },
    { id: 'routes', label: `Routes (${profile.routes_total})` },
    ...(isOwner ? [{ id: 'economy', label: 'My Economy' }] : []),
  ] as const;

  return (
    <div className={`flex flex-col h-full overflow-hidden ${surface}`}>

      {/* ── Hero ── */}
      <div
        className="relative flex-shrink-0"
        style={{
          background: profile.header_image_url
            ? `url(${profile.header_image_url}) center/cover`
            : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/70" />
        <div className="relative z-10 flex items-end gap-4 p-5 pb-4">
          <div className="relative">
            <Avatar url={profile.avatar_url} username={profile.username} size={72} />
            {profile.reputation_score >= 100 && (
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-black text-xs font-bold rounded-full px-1.5 py-0.5">✓</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white font-bold text-xl">{profile.username}</h2>
              {profile.reputation_score >= 1000 && (
                <span className="bg-yellow-400/20 border border-yellow-400/50 text-yellow-300 text-xs px-2 py-0.5 rounded-full">
                  Elite Runner
                </span>
              )}
              {isFriend && (
                <span className="bg-green-400/20 border border-green-400/50 text-green-300 text-xs px-2 py-0.5 rounded-full">
                  Friend ✓
                </span>
              )}
              {isOwner && (
                <span className="bg-purple-400/20 border border-purple-400/50 text-purple-300 text-xs px-2 py-0.5 rounded-full">
                  Your Profile
                </span>
              )}
            </div>
            {profile.bio && (
              <p className="text-gray-300 text-sm mt-1 truncate">{profile.bio}</p>
            )}
            {profile.location && (
              <p className="text-gray-400 text-xs mt-0.5">📍 {profile.location}</p>
            )}
          </div>
          {/* Global valuation */}
          <div className="text-right flex-shrink-0 hidden sm:block">
            <div className="text-gray-300 text-xs mb-0.5">Global Value</div>
            <div className="text-white font-bold text-lg">{profile.global_valuation.usd}</div>
            <div className="text-gray-400 text-xs">{profile.global_valuation.eth} ETH</div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative z-10 grid grid-cols-4 gap-px bg-black/20 border-t border-white/10">
          {[
            { label: 'Rep', value: profile.reputation_score.toFixed(0) },
            { label: 'Rank', value: `#${profile.rank}` },
            { label: 'Friends', value: profile.friendpass.holder_count.toString() },
            { label: 'Token Minted', value: profile.token.current_supply.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-2 bg-black/30">
              <span className="text-white font-semibold text-sm">{value}</span>
              <span className="text-gray-400 text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={`flex border-b flex-shrink-0 ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0
              ${tab === t.id
                ? 'border-b-2 border-purple-500 text-purple-400'
                : `${muted} hover:text-purple-400`
              }`}
          >
            {t.label}
          </button>
        ))}
        {/* Search another */}
        <div className="ml-auto flex items-center pr-3 gap-2">
          <input
            className={`text-xs rounded border px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-purple-500 ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-gray-100 border-gray-300 text-gray-700'}`}
            placeholder="other runner…"
            value={searchInput === loadedUsername ? '' : searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadProfile(searchInput); }}
          />
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ═══ OVERVIEW ═══ */}
        {tab === 'overview' && (
          <>
            {/* Mobile global value */}
            <div className="sm:hidden">
              <div className={`rounded-xl border p-4 ${card}`}>
                <p className="text-xs text-gray-400 mb-1">Global Value</p>
                <p className={`text-2xl font-bold ${textMain}`}>{profile.global_valuation.usd}</p>
                <p className="text-sm text-gray-500">{profile.global_valuation.eth} ETH</p>
              </div>
            </div>

            {/* TGE Progress */}
            <div className={`rounded-xl border p-4 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-semibold ${textMain}`}>TGE Progress</h3>
                <span className="text-xs text-gray-400">
                  {profile.token.bonding_curve_type} curve
                </span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold text-purple-400">{profile.token.tge_progress_pct}%</span>
                <div className="flex-1">
                  <ProgressBar pct={profile.token.tge_progress_pct} color="#8b5cf6" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mb-4">
                <span>{profile.token.liquidity_pool_eth} ETH raised</span>
                <span>Goal: {profile.token.tge_threshold_eth} ETH</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <StatCard label="Supply" value={profile.token.current_supply.toString()} sub="tokens sold" />
                <StatCard label="Price" value={profile.token.current_price_usd} sub={`${profile.token.current_price_eth} ETH`} />
                <StatCard label="TGE Supply" value={tgeTotalSupply.toLocaleString()} sub="at launch" />
                <StatCard label="Pool" value={`${profile.token.liquidity_pool_eth} ETH`} sub="accumulated" />
              </div>

              {/* Distribution breakdown */}
              <div>
                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Token Distribution at TGE</p>
                <div className="space-y-1.5">
                  {Object.entries(tgeDistribution).map(([group, data]) => (
                    <div key={group} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: GROUP_COLORS[group] || '#6b7280' }}
                      />
                      <span className="text-xs capitalize w-20 text-gray-300">{group}</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${data.pct}%`, background: GROUP_COLORS[group] || '#6b7280' }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right">{data.pct}%</span>
                      <span className="text-xs text-gray-500 w-20 text-right">{data.tokens.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tip CTA */}
              {!isOwner && (
                <button
                  className="mt-4 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-2.5 rounded-xl font-semibold text-sm transition-all"
                  onClick={() => {
                    // Open runner-bonding app — best effort via a custom event
                    window.dispatchEvent(new CustomEvent('open-app', {
                      detail: { appId: 'runner-bonding', props: { runnerId: profile.id } },
                    }));
                  }}
                >
                  💰 Tip Runner to Boost TGE
                </button>
              )}
            </div>

            {/* FriendPass */}
            <div className={`rounded-xl border p-4 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-semibold ${textMain}`}>FriendPass</h3>
                {isFriend && (
                  <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                    You hold a pass ✓
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatCard label="Price" value={profile.friendpass.current_price_usd} sub={`${profile.friendpass.current_price_eth} ETH`} />
                <StatCard label="Sold" value={`${profile.friendpass.passes_sold} / ${profile.friendpass.max_supply}`} sub="passes" />
                <StatCard label="Holders" value={profile.friendpass.holder_count.toString()} sub="friends" />
              </div>

              {/* Supply bar */}
              <ProgressBar
                pct={(profile.friendpass.passes_sold / profile.friendpass.max_supply) * 100}
                color={profile.friendpass.passes_sold >= profile.friendpass.max_supply * 0.9 ? '#ef4444' : '#10b981'}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1 mb-4">
                <span>{profile.friendpass.passes_sold} sold</span>
                <span>{profile.friendpass.max_supply - profile.friendpass.passes_sold} remaining</span>
              </div>

              {/* Benefits teaser */}
              <div className="mb-4 space-y-1">
                {[
                  '🗺️ Unlock all private POIs and routes',
                  '💬 Direct message the runner',
                  '🎫 Priority TGE allocation',
                  '🏆 Virality boost on leaderboard',
                ].map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2 text-sm text-gray-300">
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              {buyMsg && (
                <div className={`text-sm rounded-lg px-3 py-2 mb-3 ${buyMsg.includes('failed') || buyMsg.includes('Failed') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                  {buyMsg}
                </div>
              )}

              {!isOwner && !isFriend && (
                <button
                  onClick={handleBuyFriendPass}
                  disabled={buyingPass || !isConnected || profile.friendpass.passes_sold >= profile.friendpass.max_supply}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition-all"
                >
                  {buyingPass ? 'Processing…' : !isConnected ? 'Connect wallet to buy' : `Buy FriendPass — ${profile.friendpass.current_price_usd}`}
                </button>
              )}
              {!isOwner && isFriend && (
                <div className="w-full text-center text-green-400 text-sm py-2">
                  ✓ You are a friend of {profile.username}. All content is unlocked!
                </div>
              )}
            </div>

            {/* Content lock teaser (non-friends) */}
            {profile.content_locked && (
              <div className={`rounded-xl border p-4 text-center ${card}`}>
                <div className="text-3xl mb-2">🔒</div>
                <p className={`font-semibold ${textMain}`}>
                  {profile.pois_locked_count} more POIs & {profile.routes_locked_count} more routes are friend-exclusive
                </p>
                <p className="text-sm text-gray-400 mt-1">Buy a FriendPass to unlock all content.</p>
              </div>
            )}
          </>
        )}

        {/* ═══ POIs ═══ */}
        {tab === 'pois' && (
          <>
            {profile.content_locked && profile.pois_locked_count > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                🔒 {profile.pois_locked_count} POIs are locked — buy a FriendPass to unlock them.
              </div>
            )}
            {profile.pois.length === 0 ? (
              <div className={`text-center py-10 ${muted}`}>No POIs found for this runner.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.pois.map((poi) => (
                  <div
                    key={poi.id}
                    className={`rounded-xl border p-4 relative overflow-hidden ${card}`}
                    style={{ borderLeftColor: RARITY_COLORS[poi.rarity.toLowerCase()] || '#6b7280', borderLeftWidth: 3 }}
                  >
                    {poi.locked && (
                      <div className="absolute inset-0 backdrop-blur-sm bg-black/50 flex flex-col items-center justify-center gap-1 z-10">
                        <span className="text-2xl">🔒</span>
                        <span className="text-xs text-gray-300">Friend-exclusive</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-medium text-sm ${textMain}`}>{poi.name}</p>
                        {poi.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{poi.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {poi.locked ? '??.??, ??.??' : `${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}`}
                        </p>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0"
                        style={{
                          background: (RARITY_COLORS[poi.rarity.toLowerCase()] || '#6b7280') + '33',
                          color: RARITY_COLORS[poi.rarity.toLowerCase()] || '#9ca3af',
                        }}
                      >
                        {poi.rarity}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Placeholder locked cards */}
                {profile.content_locked && Array.from({ length: Math.min(profile.pois_locked_count, 4) }).map((_, i) => (
                  <div key={`locked-poi-${i}`} className={`rounded-xl border p-4 opacity-40 ${card}`} style={{ borderLeftWidth: 3, borderLeftColor: '#6b7280' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="h-3 w-24 bg-gray-600 rounded mb-2" />
                        <div className="h-2.5 w-16 bg-gray-700 rounded" />
                      </div>
                      <span className="text-xs text-gray-600">locked</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ ROUTES ═══ */}
        {tab === 'routes' && (
          <>
            {profile.content_locked && profile.routes_locked_count > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                🔒 {profile.routes_locked_count} routes are locked — buy a FriendPass to unlock them.
              </div>
            )}
            {profile.routes.length === 0 ? (
              <div className={`text-center py-10 ${muted}`}>No routes found for this runner.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.routes.map((route) => (
                  <div key={route.id} className={`rounded-xl border p-4 relative overflow-hidden ${card}`}>
                    {route.locked && (
                      <div className="absolute inset-0 backdrop-blur-sm bg-black/50 flex flex-col items-center justify-center gap-1 z-10">
                        <span className="text-2xl">🔒</span>
                        <span className="text-xs text-gray-300">Friend exclusive</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${textMain}`}>{route.name}</p>
                        {route.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{route.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {route.distance_km !== null && (
                            <span className="text-xs text-gray-400">🏃 {route.distance_km.toFixed(1)} km</span>
                          )}
                          {route.elevation_gain_m !== undefined && (
                            <span className="text-xs text-gray-400">⛰️ {route.elevation_gain_m}m</span>
                          )}
                          <span className="text-xs text-gray-500">✅ {route.completion_count} completions</span>
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0"
                        style={{
                          background: (DIFFICULTY_COLORS[route.difficulty?.toLowerCase()] || '#6b7280') + '33',
                          color: DIFFICULTY_COLORS[route.difficulty?.toLowerCase()] || '#9ca3af',
                        }}
                      >
                        {route.difficulty || 'moderate'}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Placeholder locked */}
                {profile.content_locked && Array.from({ length: Math.min(profile.routes_locked_count, 4) }).map((_, i) => (
                  <div key={`locked-route-${i}`} className={`rounded-xl border p-4 opacity-40 ${card}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="h-3 w-28 bg-gray-600 rounded mb-2" />
                        <div className="h-2.5 w-20 bg-gray-700 rounded" />
                      </div>
                      <span className="text-xs text-gray-600">locked</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ MY ECONOMY (owner only) ═══ */}
        {tab === 'economy' && isOwner && profile.owner_data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="FP Holders" value={profile.owner_data.friendpass_holders.length.toString()} sub="friends" />
              <StatCard label="Token Supply" value={profile.owner_data.token_supply.toString()} sub="minted" />
              <StatCard label="Liquidity Pool" value={`${profile.owner_data.liquidity_pool_eth} ETH`} sub="raised" />
              <StatCard label="Pass Revenue" value={`${(profile.friendpass.passes_sold * parseFloat(profile.friendpass.current_price_eth)).toFixed(4)} ETH`} sub="est." />
            </div>

            {/* FriendPass holders */}
            <div className={`rounded-xl border p-4 ${card}`}>
              <h3 className={`font-semibold mb-3 ${textMain}`}>FriendPass Holders</h3>
              {profile.owner_data.friendpass_holders.length === 0 ? (
                <p className={`text-sm ${muted}`}>No holders yet — share your profile to grow your community!</p>
              ) : (
                <div className="space-y-2">
                  {profile.owner_data.friendpass_holders.map((h) => (
                    <div key={h.owner_id} className="flex items-center gap-3">
                      <Avatar url={h.avatar_url} username={h.username} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${textMain}`}>{h.username || h.owner_id.slice(0, 8)}</p>
                        {h.since && (
                          <p className="text-xs text-gray-500">Since {new Date(h.since).toLocaleDateString()}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{h.passes} pass{h.passes !== 1 ? 'es' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top tippers */}
            <div className={`rounded-xl border p-4 ${card}`}>
              <h3 className={`font-semibold mb-3 ${textMain}`}>Top Tippers (TGE)</h3>
              {profile.owner_data.top_tippers.length === 0 ? (
                <p className={`text-sm ${muted}`}>No tippers yet.</p>
              ) : (
                <div className="space-y-2">
                  {profile.owner_data.top_tippers.map((t, idx) => (
                    <div key={t.owner_id} className="flex items-center gap-3">
                      <div className="w-6 text-xs text-gray-500 text-center">#{idx + 1}</div>
                      <Avatar url={t.avatar_url} username={t.username} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${textMain}`}>{t.username || t.owner_id.slice(0, 8)}</p>
                      </div>
                      <span className="text-xs text-yellow-400 font-medium">{t.total_tipped_eth} ETH</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TGE distribution reminder */}
            <div className={`rounded-xl border p-4 ${card}`}>
              <h3 className={`font-semibold mb-3 ${textMain}`}>Your TGE Distribution</h3>
              <div className="space-y-1.5">
                {Object.entries(tgeDistribution).map(([group, data]) => (
                  <div key={group} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLORS[group] || '#6b7280' }} />
                    <span className="text-xs capitalize w-20 text-gray-300">{group}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${data.pct}%`, background: GROUP_COLORS[group] || '#6b7280' }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right">{data.pct}%</span>
                    <span className="text-xs text-gray-500 w-24 text-right">{data.tokens.toLocaleString()} tokens</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">Distribution set by admin — contact support to adjust.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
