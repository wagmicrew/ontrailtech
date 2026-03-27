import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';

type Tab = 'runners' | 'ancients';

interface RunnerEntry {
  runnerId: string;
  username: string;
  avatar_url?: string | null;
  totalAura: string;
  auraLevel: string;
  ancientSupporterCount: number;
}

interface AncientEntry {
  walletAddress: string;
  username?: string | null;
  avatar_url?: string | null;
  totalInfluence: string;
  runnersSupported: number;
  hasAccount?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Rising: 'bg-blue-100 text-blue-600',
  Strong: 'bg-purple-100 text-purple-600',
  Dominant: 'bg-amber-100 text-amber-600',
};

export default function AuraLeaderboard() {
  const [tab, setTab] = useState<Tab>('runners');
  const [runners, setRunners] = useState<RunnerEntry[]>([]);
  const [ancients, setAncients] = useState<AncientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const fetcher = tab === 'runners'
      ? api.getRunnerLeaderboard().then((d: any) => setRunners(d?.runners ?? d ?? []))
      : api.getAncientLeaderboard().then((d: any) => setAncients(d?.ancients ?? d ?? []));
    fetcher.catch(() => {}).finally(() => setLoading(false));
  }, [tab]);

  const handleRunnerClick = (r: RunnerEntry) => {
    if (r.username) navigate(`/profile?runner=${r.username}`);
  };

  const handleAncientClick = (a: AncientEntry) => {
    if (a.username) navigate(`/profile?runner=${a.username}`);
    // If no account, could show wallet summary — for now navigate to explore
  };

  const shortWallet = (w: string) => w ? `${w.slice(0, 6)}…${w.slice(-4)}` : '—';

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Aura Leaderboard</h1>
        <p className="text-sm text-gray-500 mb-6">
          Discover top aura runners and the most influential Ancient holders.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {([
            ['runners', 'Top Aura Runners'],
            ['ancients', 'Most Influential Ancients'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'runners' ? (
          <div className="space-y-2">
            {runners.length === 0 && (
              <p className="text-center text-gray-400 py-12">No aura runners yet.</p>
            )}
            {runners.map((r, i) => (
              <button
                key={r.runnerId}
                onClick={() => handleRunnerClick(r)}
                className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all text-left"
              >
                <span className="w-7 text-sm font-bold text-gray-400 tabular-nums">
                  {i + 1}
                </span>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    r.username?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {r.username || 'Anonymous'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Aura {parseFloat(r.totalAura).toFixed(1)} · {r.ancientSupporterCount} Ancient{r.ancientSupporterCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_COLORS[r.auraLevel] || 'bg-gray-100 text-gray-500'}`}>
                  {r.auraLevel}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {ancients.length === 0 && (
              <p className="text-center text-gray-400 py-12">No Ancient holders yet.</p>
            )}
            {ancients.map((a, i) => (
              <button
                key={a.walletAddress}
                onClick={() => handleAncientClick(a)}
                className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-amber-200 hover:shadow-sm transition-all text-left"
              >
                <span className="w-7 text-sm font-bold text-gray-400 tabular-nums">
                  {i + 1}
                </span>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {a.avatar_url ? (
                    <img src={a.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    a.username?.[0]?.toUpperCase() || '🏛'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {a.username || shortWallet(a.walletAddress)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Influence {parseFloat(a.totalInfluence).toFixed(1)} · {a.runnersSupported} runner{a.runnersSupported !== 1 ? 's' : ''} supported
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
