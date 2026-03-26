import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';

interface InfluenceNode {
  userId: string;
  username: string | null;
  avatar: string | null;
  reputationScore: number;
  friendPassesBought: number;
  isActive: boolean;
}

interface InfluenceData {
  totalNetworkSize: number;
  directReferrals: number;
  networkValue: string;
  growthRate: number;
  nodes: InfluenceNode[];
}

export default function InfluenceGraph({ userId }: { userId: string }) {
  const [data, setData] = useState<InfluenceData | null>(null);

  useEffect(() => {
    api.getInfluenceGraph(userId).then(setData).catch(() => {});
  }, [userId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-white mb-1">Your influence</h3>
          <p className="text-slate-400 text-sm">Your referral network and its value</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
            <p className="text-xl font-bold text-white">{data.totalNetworkSize}</p>
            <p className="text-xs text-slate-500">Network size</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
            <p className="text-xl font-bold text-emerald-400">{data.networkValue} ETH</p>
            <p className="text-xs text-slate-500">Network value</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
            <p className="text-xl font-bold text-white">{data.directReferrals}</p>
            <p className="text-xs text-slate-500">Direct referrals</p>
          </div>
        </div>

        {/* Radial graph visualization */}
        <div className="relative flex items-center justify-center py-8">
          {/* Center node (you) */}
          <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white font-bold text-lg shadow-xl shadow-emerald-500/30">
            You
          </div>

          {/* Referral nodes arranged in a circle */}
          {data.nodes.slice(0, 8).map((node, i) => {
            const angle = (i / Math.min(data.nodes.length, 8)) * 2 * Math.PI - Math.PI / 2;
            const radius = 100;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const hue = node.username ? node.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360 : 200;

            return (
              <motion.div key={node.userId}
                initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="absolute z-10"
                style={{ transform: `translate(${x}px, ${y}px)` }}>
                {/* Connection line */}
                <svg className="absolute" style={{ left: -x, top: -y, width: Math.abs(x) * 2 || 1, height: Math.abs(y) * 2 || 1, overflow: 'visible' }}>
                  <line x1={x} y1={y} x2={0} y2={0} stroke="rgba(16,185,129,0.2)" strokeWidth={1} />
                </svg>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 ${
                  node.isActive ? 'border-emerald-400' : 'border-slate-600 opacity-50'
                }`} style={{ backgroundColor: `hsl(${hue}, 50%, 40%)` }}
                  title={node.username || 'Anonymous'}>
                  {node.username?.[0]?.toUpperCase() || '?'}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Node list */}
        {data.nodes.length > 0 && (
          <div className="space-y-2">
            {data.nodes.map((node) => (
              <div key={node.userId}
                className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                  node.isActive ? 'bg-emerald-600' : 'bg-slate-600'
                }`}>
                  {node.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{node.username || 'Anonymous'}</p>
                  <p className="text-xs text-slate-500">{node.friendPassesBought} passes · Rep {node.reputationScore}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  node.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'
                }`}>
                  {node.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}

        <a href="/referrals"
          className="block w-full text-center bg-gradient-to-r from-emerald-500 to-green-400 text-white py-3 rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 transition-all hover:-translate-y-0.5">
          Grow your network
        </a>
      </motion.div>
    </div>
  );
}