import { useState, useEffect } from 'react';
import { auraFeedback, type AuraToast } from '../lib/aura-feedback';

/**
 * Renders aura feedback toasts as a fixed overlay.
 * Drop this once in your app root (e.g. Layout or App).
 */
export default function AuraToastContainer() {
  const [toasts, setToasts] = useState<AuraToast[]>([]);

  useEffect(() => auraFeedback.subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl
            bg-slate-900/90 backdrop-blur-sm text-white text-sm font-medium shadow-xl
            animate-slide-in ${t.pulse ? 'animate-pulse-once' : ''}`}
        >
          <span className="text-base">{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
