import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

/** Aura level from the backend */
export type AuraLevel = 'None' | 'Low' | 'Rising' | 'Strong' | 'Dominant';

/** Color mapping per aura level */
const LEVEL_COLORS: Record<AuraLevel, { bg: string; text: string; ring: string }> = {
  None: { bg: '', text: '', ring: '' },
  Low: { bg: 'bg-gray-100', text: 'text-gray-600', ring: 'ring-gray-300' },
  Rising: { bg: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-400' },
  Strong: { bg: 'bg-purple-100', text: 'text-purple-600', ring: 'ring-purple-400' },
  Dominant: { bg: 'bg-amber-100', text: 'text-amber-600', ring: 'ring-amber-400' },
};

/** Glow shadow styles for Strong/Dominant */
const GLOW_STYLES: Partial<Record<AuraLevel, string>> = {
  Strong: 'shadow-[0_0_18px_4px_rgba(168,85,247,0.35)]',
  Dominant: 'shadow-[0_0_24px_6px_rgba(234,179,8,0.4)]',
};

interface AuraData {
  totalAura: string;
  auraLevel: AuraLevel;
  ancientSupporterCount: number;
  weightedAura: string;
}

interface AuraIndicatorProps {
  runnerId: string;
  /** Wrap avatar element — glow ring renders around children for Strong/Dominant */
  children?: React.ReactNode;
  /** Callback to expose fetched aura level to parent */
  onAuraLoaded?: (level: AuraLevel) => void;
}

/**
 * Displays aura level badge, Ancient supporter count, and glow ring around avatar.
 * Fetches from /aura/{runner_id}. Renders nothing when aura score is 0.
 */
export default function AuraIndicator({ runnerId, children, onAuraLoaded }: AuraIndicatorProps) {
  const [aura, setAura] = useState<AuraData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!runnerId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.getRunnerAura(runnerId);
        if (!cancelled) {
          setAura(data as AuraData);
          onAuraLoaded?.((data as AuraData).auraLevel);
        }
      } catch {
        // Silently fail — aura is supplementary
      }
    })();

    return () => { cancelled = true; };
  }, [runnerId, onAuraLoaded]);

  const showBoostToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // No aura indicators when score is 0 or no data
  if (!aura || aura.auraLevel === 'None' || aura.totalAura === '0') {
    return <>{children}</>;
  }

  const level = aura.auraLevel;
  const colors = LEVEL_COLORS[level];
  const glowClass = GLOW_STYLES[level] ?? '';
  const hasGlow = level === 'Strong' || level === 'Dominant';

  return (
    <div className="relative">
      {/* Avatar wrapper with glow ring for Strong/Dominant */}
      {children && (
        <div className={`relative rounded-full ${hasGlow ? `ring-2 ${colors.ring} ${glowClass}` : ''}`}>
          {children}
        </div>
      )}

      {/* Badge + supporter count row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Aura level badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
          {level === 'Dominant' && '✨ '}{level}
        </span>

        {/* Ancient supporter count */}
        {aura.ancientSupporterCount > 0 && (
          <span className="text-xs text-slate-500">
            Backed by {aura.ancientSupporterCount} Ancient{aura.ancientSupporterCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Boost feedback toast */}
      {toast && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg animate-fade-in-out">
          {toast}
        </div>
      )}
    </div>
  );
}

/**
 * Trigger a boost toast from outside the component.
 * Usage: call showAuraBoostToast on tip/FriendPass actions.
 */
export function useAuraBoostToast() {
  const [toast, setToast] = useState<string | null>(null);

  const showBoostToast = useCallback((boostPercent: number) => {
    setToast(`🔥 Aura Boost: +${boostPercent}% tip effectiveness`);
    setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showBoostToast };
}
