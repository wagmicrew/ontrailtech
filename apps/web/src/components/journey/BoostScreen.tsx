import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useWallets } from '@privy-io/react-auth';
import { encodeFunctionData, parseEther } from 'viem';
import { api } from '../../lib/api';

const TIP_VAULT_ADDRESS = import.meta.env.VITE_TIP_VAULT_ADDRESS || '';
const TIP_VAULT_ABI = [
  { name: 'tipRunner', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'runner', type: 'address' }], outputs: [] },
] as const;

const TIP_AMOUNTS = ['0.001', '0.005', '0.01', '0.05'];

interface BoostScreenProps {
  runnerId: string;
  runnerUsername: string;
  runnerWallet: string;
  userId: string;
}

export default function BoostScreen({ runnerId, runnerUsername, runnerWallet, userId }: BoostScreenProps) {
  const [progress, setProgress] = useState<any>(null);
  const [selectedTip, setSelectedTip] = useState(1);
  const [tipping, setTipping] = useState(false);
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  useEffect(() => {
    api.getTokenProgress(runnerId).then(setProgress).catch(() => {});
  }, [runnerId]);

  const handleTip = useCallback(async () => {
    if (!wallet || !TIP_VAULT_ADDRESS || tipping) return;
    setTipping(true);
    try {
      const provider = await wallet.getEthersProvider();
      const signer = provider.getSigner();
      const data = encodeFunctionData({
        abi: TIP_VAULT_ABI, functionName: 'tipRunner',
        args: [runnerWallet as `0x${string}`],
      });
      await (signer as any).sendTransaction({
        to: TIP_VAULT_ADDRESS, data,
        value: parseEther(TIP_AMOUNTS[selectedTip]).toString(),
      });
      // Optimistic update
      if (progress) {
        const tipEth = parseFloat(TIP_AMOUNTS[selectedTip]);
        const newTotal = parseFloat(progress.totalTips) + tipEth;
        const threshold = parseFloat(progress.tgeThreshold) || 1;
        setProgress({
          ...progress,
          totalTips: newTotal.toFixed(6),
          userContribution: (parseFloat(progress.userContribution) + tipEth).toFixed(6),
          progressPercent: Math.min(100, Math.round((newTotal / threshold) * 100)),
        });
      }
    } catch (err) {
      console.error('Tip failed:', err);
    }
    setTipping(false);
  }, [wallet, runnerWallet, selectedTip, tipping, progress]);

  if (!progress) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const emoji = progress.progressPercent >= 75 ? '🔥' : progress.progressPercent >= 40 ? '🚀' : '📈';

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Boost {runnerUsername}</h2>
          <p className="text-slate-400">Help launch their token</p>
        </div>

        {/* Momentum meter */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{emoji}</span>
            <span className="text-white font-semibold">
              Momentum {progress.momentum} — {progress.progressPercent}% to launch
            </span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-emerald-400 to-green-400 rounded-full"
              initial={{ width: 0 }} animate={{ width: `${progress.progressPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center text-sm">
            <div><p className="text-white font-semibold">{progress.totalTips} ETH</p><p className="text-xs text-slate-500">Total tips</p></div>
            <div><p className="text-white font-semibold">{progress.supporterCount}</p><p className="text-xs text-slate-500">Supporters</p></div>
            <div><p className="text-white font-semibold">{progress.userContribution} ETH</p><p className="text-xs text-slate-500">Your boost</p></div>
          </div>
        </div>

        {/* Tip selector */}
        <div className="flex gap-2">
          {TIP_AMOUNTS.map((amt, i) => (
            <button key={i} onClick={() => setSelectedTip(i)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                selectedTip === i
                  ? 'bg-emerald-500/30 text-emerald-400 ring-1 ring-emerald-400'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}>
              {amt} ETH
            </button>
          ))}
        </div>

        <button onClick={handleTip} disabled={tipping}
          className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 disabled:opacity-50 transition-all hover:-translate-y-0.5">
          {tipping ? 'Boosting...' : `Boost ${runnerUsername}`}
        </button>
      </motion.div>
    </div>
  );
}