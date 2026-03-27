import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { encodeFunctionData, parseEther, formatEther } from 'viem';
import { api } from '../../lib/api';

// FriendShares contract ABI (minimal for buy)
const FRIEND_SHARES_ABI = [
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'runner', type: 'address' }],
    outputs: [],
  },
  {
    name: 'getShares',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'runner', type: 'address' }, { name: 'holder', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const MAX_PASSES_PER_WALLET = 5;
const FRIEND_SHARES_ADDRESS = import.meta.env.VITE_FRIEND_SHARES_ADDRESS || '';

interface FriendPassPriceInfo {
  currentPrice: string;
  currentPriceFiat: string;
  nextPrice: string;
  currentSupply: number;
  maxSupply: number;
  benefits: string[];
}

interface FriendPassPurchaseProps {
  runnerId: string;
  runnerUsername: string;
  runnerWallet: string;
  onPurchaseComplete: (result: { txHash: string; friendPassNumber: number }) => void;
}

type PurchaseState = 'idle' | 'loading' | 'purchasing' | 'confirming' | 'success' | 'error';
type ErrorType = 'supply_exhausted' | 'insufficient_eth' | 'anti_whale' | 'self_purchase' | 'tx_failed' | 'unknown';

export default function FriendPassPurchase({
  runnerId, runnerUsername, runnerWallet, onPurchaseComplete,
}: FriendPassPurchaseProps) {
  const [priceInfo, setPriceInfo] = useState<FriendPassPriceInfo | null>(null);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>('idle');
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [userHoldings, setUserHoldings] = useState<number>(0);

  const { wallet, userId } = useAuth();
  // TODO: Replace with actual wallet provider integration (ConnectKit/wagmi)
  const userWallet: any = wallet ? { address: wallet, getEthersProvider: async () => { throw new Error('Use wagmi provider'); } } : null;

  // Fetch price data
  useEffect(() => {
    setPurchaseState('loading');
    api.getFriendPassPrice(runnerId)
      .then((data) => { setPriceInfo(data as FriendPassPriceInfo); setPurchaseState('idle'); })
      .catch(() => setPurchaseState('error'));
  }, [runnerId]);

  // Self-purchase check
  const isSelfPurchase = userWallet?.address?.toLowerCase() === runnerWallet?.toLowerCase();

  const handlePurchase = useCallback(async () => {
    if (!priceInfo || !userWallet || !FRIEND_SHARES_ADDRESS) return;

    // Anti-whale check
    if (userHoldings >= MAX_PASSES_PER_WALLET) {
      setErrorType('anti_whale');
      setPurchaseState('error');
      return;
    }
    // Self-purchase prevention
    if (isSelfPurchase) {
      setErrorType('self_purchase');
      setPurchaseState('error');
      return;
    }
    // Supply exhausted
    if (priceInfo.currentSupply >= priceInfo.maxSupply) {
      setErrorType('supply_exhausted');
      setPurchaseState('error');
      return;
    }

    setPurchaseState('purchasing');
    try {
      const provider = await userWallet.getEthersProvider();
      const signer = provider.getSigner();

      const data = encodeFunctionData({
        abi: FRIEND_SHARES_ABI,
        functionName: 'buy',
        args: [runnerWallet as `0x${string}`],
      });

      const tx = await (signer as any).sendTransaction({
        to: FRIEND_SHARES_ADDRESS,
        data,
        value: parseEther(priceInfo.currentPrice).toString(),
      });

      setPurchaseState('confirming');

      // Optimistic: report success immediately with TX hash
      onPurchaseComplete({
        txHash: tx.hash,
        friendPassNumber: priceInfo.currentSupply + 1,
      });
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || '';
      if (msg.includes('insufficient')) setErrorType('insufficient_eth');
      else setErrorType('tx_failed');
      setPurchaseState('error');
    }
  }, [priceInfo, userWallet, runnerWallet, isSelfPurchase, userHoldings, onPurchaseComplete]);

  if (purchaseState === 'loading' || !priceInfo) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const supplyPct = Math.min((priceInfo.currentSupply / priceInfo.maxSupply) * 100, 100);

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Secure your position</h2>
          <p className="text-slate-400">Support {runnerUsername} and get in early</p>
        </div>

        {/* Supply bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>{priceInfo.currentSupply}/{priceInfo.maxSupply} positions secured</span>
            <span>{Math.round(supplyPct)}% claimed</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-emerald-400 to-green-400 rounded-full"
              initial={{ width: 0 }} animate={{ width: `${supplyPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }} />
          </div>
        </div>

        {/* Price display */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-400 text-sm">Current price</span>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{priceInfo.currentPrice} ETH</p>
              <p className="text-sm text-slate-400">{priceInfo.currentPriceFiat}</p>
            </div>
          </div>
          <p className="text-xs text-amber-400">
            Price increases to {priceInfo.nextPrice} ETH after this position
          </p>
        </div>

        {/* Benefits */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">What you get</p>
          {priceInfo.benefits.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-slate-400">
              <span className="text-emerald-400 mt-0.5">✓</span>
              <span>{b}</span>
            </div>
          ))}
        </div>

        {/* Error states */}
        <AnimatePresence>
          {purchaseState === 'error' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
              {errorType === 'supply_exhausted' && (
                <>
                  <p className="text-rose-400 font-semibold mb-2">All positions claimed</p>
                  <p className="text-sm text-slate-400 mb-3">This runner's FriendPass is sold out. You can still boost them.</p>
                  <button className="bg-gradient-to-r from-amber-500 to-orange-400 text-white px-5 py-2 rounded-xl text-sm font-semibold">
                    Boost {runnerUsername} instead
                  </button>
                </>
              )}
              {errorType === 'insufficient_eth' && (
                <>
                  <p className="text-rose-400 font-semibold mb-2">Insufficient ETH</p>
                  <p className="text-sm text-slate-400">Add funds to your wallet to continue.</p>
                </>
              )}
              {errorType === 'anti_whale' && (
                <p className="text-rose-400 font-semibold">You already hold the maximum {MAX_PASSES_PER_WALLET} passes for this runner</p>
              )}
              {errorType === 'self_purchase' && (
                <p className="text-rose-400 font-semibold">You can't purchase your own FriendPass</p>
              )}
              {errorType === 'tx_failed' && (
                <>
                  <p className="text-rose-400 font-semibold mb-2">Transaction failed</p>
                  <button onClick={() => { setPurchaseState('idle'); setErrorType(null); }}
                    className="bg-white/10 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors">
                    Try again
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        {purchaseState !== 'error' && (
          <button onClick={handlePurchase}
            disabled={purchaseState === 'purchasing' || purchaseState === 'confirming' || isSelfPurchase}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {purchaseState === 'purchasing' ? 'Confirming in wallet...' :
             purchaseState === 'confirming' ? 'Processing...' :
             'Secure your position'}
          </button>
        )}
      </motion.div>
    </div>
  );
}