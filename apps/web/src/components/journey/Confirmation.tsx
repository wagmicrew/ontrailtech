import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';

interface ConfirmationProps {
  txHash: string;
  friendPassNumber: number;
  runnerUsername: string;
  onContinue: () => void;
}

export default function Confirmation({ txHash, friendPassNumber, runnerUsername, onContinue }: ConfirmationProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [totalSupply, setTotalSupply] = useState(friendPassNumber);
  const percentile = totalSupply > 0 ? Math.max(1, Math.round((friendPassNumber / totalSupply) * 100)) : 0;

  // Poll for confirmation
  useEffect(() => {
    if (confirmed) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getFriendPassStatus(txHash);
        if (status.confirmed) {
          setConfirmed(true);
          setTotalSupply(status.totalSupply);
          clearInterval(interval);
        }
      } catch { /* keep polling */ }
    }, 3000);

    // Timeout: revert after 15s if not confirmed
    const timeout = setTimeout(() => { clearInterval(interval); }, 15000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [txHash, confirmed]);

  return (
    <div className="max-w-md mx-auto px-6 py-12 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.6 }} className="text-6xl">🎉</motion.div>

        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Position secured!</h2>
          <p className="text-slate-400">You're now an early supporter of {runnerUsername}</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 space-y-4">
          <div className="flex justify-between">
            <span className="text-slate-400">Your position</span>
            <span className="text-2xl font-bold text-emerald-400">#{friendPassNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total supply</span>
            <span className="text-white font-semibold">{totalSupply}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Percentile</span>
            <span className="text-amber-400 font-semibold">Top {percentile}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Status</span>
            <span className={`text-sm font-semibold ${confirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {confirmed ? '✓ Confirmed' : '⏳ Confirming...'}
            </span>
          </div>
        </div>

        <button onClick={onContinue}
          className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-0.5">
          Continue your journey
        </button>
      </motion.div>
    </div>
  );
}