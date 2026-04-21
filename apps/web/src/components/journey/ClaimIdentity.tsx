import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';

const PRESET_AVATARS = ['🏃', '🏔️', '🌲', '🦅', '🐺', '🌊', '⚡', '🔥', '🌟', '💎'];

interface ClaimIdentityProps {
  userId: string;
  onClaimed: (username: string) => void;
  onSkip: () => void;
}

export default function ClaimIdentity({ userId, onClaimed, onSkip }: ClaimIdentityProps) {
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced availability check
  useEffect(() => {
    if (username.length < 3) { setAvailable(null); setReason(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.checkUsername(username);
        setAvailable(res.available);
        setReason(res.reason || null);
      } catch { setAvailable(false); setReason('Check failed'); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  const handleSubmit = useCallback(async () => {
    if (!available || submitting) return;
    setSubmitting(true);
    try {
      await api.claimIdentity(username);
      onClaimed(username);
    } catch { setReason('Claim failed. Try again.'); }
    setSubmitting(false);
  }, [username, available, submitting, onClaimed]);

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Claim your identity</h2>
          <p className="text-slate-400">Choose your avatar and username</p>
        </div>

        {/* Avatar picker */}
        <div className="flex flex-wrap justify-center gap-3">
          {PRESET_AVATARS.map((emoji, i) => (
            <button key={i} onClick={() => setSelectedAvatar(i)}
              className={`w-14 h-14 rounded-full text-2xl flex items-center justify-center transition-all ${
                selectedAvatar === i
                  ? 'bg-emerald-500/30 ring-2 ring-emerald-400 scale-110'
                  : 'bg-white/5 hover:bg-white/10'
              }`}>
              {emoji}
            </button>
          ))}
        </div>

        {/* Username input */}
        <div>
          <div className="relative">
            <input type="text" value={username} maxLength={20}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="your-username"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
            {available !== null && (
              <span className={`absolute right-3 top-3.5 text-sm ${available ? 'text-emerald-400' : 'text-rose-400'}`}>
                {available ? '✓' : '✗'}
              </span>
            )}
          </div>
          {username.length >= 3 && (
            <p className="text-sm mt-2 text-slate-400">
              {available ? (
                <span className="text-emerald-400">{username}.ontrail.tech is yours</span>
              ) : reason}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button onClick={handleSubmit} disabled={!available || submitting}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-400 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5">
            {submitting ? 'Claiming...' : 'Claim your identity'}
          </button>
          <button onClick={onSkip}
            className="w-full text-slate-400 py-3 text-sm hover:text-white transition-colors">
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  );
}