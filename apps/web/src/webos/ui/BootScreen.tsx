import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  onComplete: () => void;
}

const BOOT_LINES = [
  { delay: 0,    text: 'OnTrail OS v1.0.0 — kernel booting…',       color: 'text-green-400' },
  { delay: 180,  text: 'Loading system modules…',                    color: 'text-gray-300' },
  { delay: 320,  text: 'Initializing event bus…                [OK]',color: 'text-gray-300' },
  { delay: 480,  text: 'Mounting file services…                [OK]',color: 'text-gray-300' },
  { delay: 620,  text: 'Starting auth service…                 [OK]',color: 'text-gray-300' },
  { delay: 760,  text: 'Connecting to kernel via WebSocket…',        color: 'text-yellow-400' },
  { delay: 940,  text: 'Loading app registry…                  [OK]',color: 'text-gray-300' },
  { delay: 1080, text: 'Restoring session…                     [OK]',color: 'text-gray-300' },
  { delay: 1200, text: 'Web3 subsystem ready.',                      color: 'text-purple-400' },
  { delay: 1340, text: 'OSM / Trail Lab engine loaded.',             color: 'text-blue-400' },
  { delay: 1480, text: '',                                            color: '' },
  { delay: 1520, text: 'System ready. Welcome to OnTrail OS.',        color: 'text-green-300' },
];

const TOTAL_MS = 2200;

export default function BootScreen({ onComplete }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), line.delay));
    });
    const progressInterval = setInterval(() => {
      setProgress(p => {
        const next = p + (100 / (TOTAL_MS / 60));
        if (next >= 100) { clearInterval(progressInterval); return 100; }
        return next;
      });
    }, 60);
    timers.push(setTimeout(() => { setDone(true); }, TOTAL_MS));
    return () => { timers.forEach(clearTimeout); clearInterval(progressInterval); };
  }, []);

  useEffect(() => {
    if (done) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [done, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-[9999] font-mono"
    >
      {/* Logo */}
      <div className="mb-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-white tracking-tight">OnTrail OS</span>
      </div>

      {/* Terminal log */}
      <div className="w-full max-w-xl bg-gray-900/80 rounded-2xl border border-gray-800 p-6 text-xs leading-6 min-h-[280px]">
        {BOOT_LINES.slice(0, visibleCount).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className={line.color || 'text-gray-500'}
          >
            {line.text || '\u00A0'}
          </motion.div>
        ))}
        {visibleCount < BOOT_LINES.length && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="inline-block w-2 h-3.5 bg-green-400 ml-0.5"
          />
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-6 w-full max-w-xl h-1 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-600">{Math.round(progress)}%</p>
    </motion.div>
  );
}
