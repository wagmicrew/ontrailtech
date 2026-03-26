import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';

interface ReferralScreenProps {
  userId: string;
  username: string | null;
}

export default function ReferralScreen({ userId, username }: ReferralScreenProps) {
  const [referralLink, setReferralLink] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState({ total_referrals: 0, active_referrals: 0, reputation_earned: 0, rewards_earned: '0' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.generateReferral().then((data: any) => {
      setReferralLink(data.referral_link);
      setReferralCode(data.referral_code);
    }).catch(() => {});
    api.getReferralStats(userId).then((data: any) => setStats(data)).catch(() => {});
  }, [userId]);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnX = () => {
    const text = encodeURIComponent(
      `🏃 I just secured my position on OnTrail!\n\n🔥 Join me and get in early:\n${referralLink}\n\n#OnTrail #Web3`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const nativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'Join me on OnTrail', url: referralLink });
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Grow your network</h2>
          <p className="text-slate-400">Share your link and earn when friends join</p>
        </div>

        {/* Referral link */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
          <p className="text-xs text-slate-500 mb-2">Your referral link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-emerald-400 text-sm truncate">{referralLink}</code>
            <button onClick={copyLink}
              className="px-3 py-1.5 bg-white/10 rounded-lg text-xs text-white hover:bg-white/20 transition-colors">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="flex gap-3">
          <button onClick={shareOnX}
            className="flex-1 bg-black text-white py-3 rounded-xl font-semibold text-sm border border-white/10 hover:bg-white/5 transition-colors">
            Share on 𝕏
          </button>
          <button onClick={copyLink}
            className="flex-1 bg-white/5 text-white py-3 rounded-xl font-semibold text-sm border border-white/10 hover:bg-white/10 transition-colors">
            Copy link
          </button>
          {'share' in navigator && (
            <button onClick={nativeShare}
              className="flex-1 bg-white/5 text-white py-3 rounded-xl font-semibold text-sm border border-white/10 hover:bg-white/10 transition-colors">
              Share
            </button>
          )}
        </div>

        {/* Incentives */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">What you earn</p>
          {[
            { icon: '📈', text: '+20 reputation per referral' },
            { icon: '💰', text: '5% of FriendPass activity from referrals' },
            { icon: '⚡', text: 'Early access to new features' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
              <span>{item.icon}</span><span>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total referrals', value: stats.total_referrals },
            { label: 'Active', value: stats.active_referrals },
            { label: 'Rep earned', value: `+${stats.reputation_earned}` },
            { label: 'Rewards', value: `${stats.rewards_earned} ETH` },
          ].map((s, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}