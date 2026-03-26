import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';

export default function ProgressDashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.getDashboardProgress().then(setData).catch(() => {});
  }, [userId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const { reputation, supporters, friendPasses, streakDays, rankChange } = data;

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Your progress</h2>
          <p className="text-slate-400">Track your OnTrail journey</p>
        </div>

        {/* Activity rings placeholder */}
        <div className="flex justify-center">
          <div className="relative w-40 h-40">
            {[
              { label: 'Steps', pct: 65, color: '#22c55e', size: 140 },
              { label: 'Reputation', pct: Math.min(reputation.score, 100), color: '#f59e0b', size: 105 },
              { label: 'Token', pct: 30, color: '#ec4899', size: 70 },
            ].map((ring) => {
              const r = ring.size / 2 - 6;
              const c = 2 * Math.PI * r;
              return (
                <svg key={ring.label} className="absolute inset-0 m-auto -rotate-90" width={ring.size} height={ring.size}>
                  <circle cx={ring.size/2} cy={ring.size/2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={8} />
                  <motion.circle cx={ring.size/2} cy={ring.size/2} r={r} fill="none" stroke={ring.color} strokeWidth={8}
                    strokeLinecap="round" strokeDasharray={c}
                    initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - ring.pct / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut' }} />
                </svg>
              );
            })}
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
            <p className="text-2xl font-bold text-white">{reputation.score}</p>
            <p className="text-xs text-slate-500">Reputation</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
            <p className="text-2xl font-bold text-white">#{reputation.rank}</p>
            <p className="text-xs text-slate-500">Rank</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
            <p className="text-2xl font-bold text-white">{supporters.count}</p>
            <p className="text-xs text-slate-500">Supporters</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
            <p className="text-2xl font-bold text-white">{friendPasses.held}</p>
            <p className="text-xs text-slate-500">FriendPasses</p>
          </div>
        </div>

        {/* Retention hooks */}
        <div className="space-y-2">
          {streakDays > 0 && (
            <div className="flex items-center gap-2 text-sm bg-white/5 rounded-xl px-4 py-3 border border-white/5">
              <span>🔥</span><span className="text-white">{streakDays} day streak</span>
            </div>
          )}
          {rankChange !== 0 && (
            <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${
              rankChange > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              <span>{rankChange > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(rankChange)} ranks {rankChange > 0 ? 'up' : 'down'} since yesterday</span>
            </div>
          )}
          {rankChange < -2 && (
            <div className="flex items-center gap-2 text-sm bg-rose-500/10 rounded-xl px-4 py-3 border border-rose-500/20 text-rose-400">
              <span>⚠️</span><span>Someone passed you! Time to boost.</span>
            </div>
          )}
        </div>

        <a href="/explore"
          className="block w-full text-center bg-gradient-to-r from-emerald-500 to-green-400 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 transition-all hover:-translate-y-0.5">
          Explore more
        </a>
      </motion.div>
    </div>
  );
}