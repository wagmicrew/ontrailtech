import { motion, AnimatePresence } from 'framer-motion';

interface OnTrailLoaderProps {
  message?: string;
  subMessage?: string;
  variant?: 'fullscreen' | 'inline';
}

export default function OnTrailLoader({ message, subMessage, variant = 'fullscreen' }: OnTrailLoaderProps) {
  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <motion.div className="relative w-12 h-12">
          <motion.div className="absolute inset-0 rounded-full border-3 border-emerald-400/30" />
          <motion.div className="absolute inset-0 rounded-full border-3 border-emerald-400 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} />
        </motion.div>
        {message && <p className="text-sm text-slate-400">{message}</p>}
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/98 backdrop-blur-xl"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }} className="flex flex-col items-center gap-6">
          <motion.img src="/ontrail-logo.png" alt="OnTrail" className="h-10 brightness-0 invert opacity-60"
            animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
          <motion.div className="relative w-16 h-16">
            <motion.div className="absolute inset-0 rounded-full border-4 border-emerald-400/20" />
            <motion.div className="absolute inset-0 rounded-full border-4 border-emerald-400 border-t-transparent"
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
            <motion.div className="absolute inset-2 rounded-full border-4 border-green-300/20" />
            <motion.div className="absolute inset-2 rounded-full border-4 border-green-300 border-b-transparent"
              animate={{ rotate: -360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} />
          </motion.div>
          {message && (
            <motion.p className="text-lg font-semibold text-white" initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>{message}</motion.p>
          )}
          {subMessage && (
            <motion.p className="text-sm text-slate-400 max-w-xs text-center" initial={{ opacity: 0 }}
              animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{subMessage}</motion.p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}