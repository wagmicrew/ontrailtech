import type { CSSProperties } from 'react';

type AuraLevel = 'None' | 'Low' | 'Rising' | 'Strong' | 'Dominant';

interface AuraRingsProps {
  auraLevel: AuraLevel;
  /** Size of the overlay in px — should match the activity rings container */
  size?: number;
}

/**
 * Northern-lights style animated gradient overlay behind activity rings.
 * Rising → faint gradient, Strong → flowing glow, Dominant → dynamic shimmer.
 * Keeps opacity <30%, slow wave motion, targets 30-60 FPS via CSS animations.
 */
export default function AuraRings({ auraLevel, size = 144 }: AuraRingsProps) {
  if (auraLevel === 'None' || auraLevel === 'Low') return null;

  const config = LEVEL_CONFIG[auraLevel];
  if (!config) return null;

  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 0,
  };

  return (
    <div style={containerStyle} aria-hidden="true">
      <style>{KEYFRAMES}</style>
      {/* Primary gradient layer */}
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          borderRadius: '50%',
          background: config.gradient,
          opacity: config.opacity,
          animation: `auraWave ${config.duration}s ease-in-out infinite alternate`,
          filter: `blur(${config.blur}px)`,
          willChange: 'transform, opacity',
        }}
      />
      {/* Secondary shimmer layer for Dominant */}
      {auraLevel === 'Dominant' && (
        <div
          style={{
            position: 'absolute',
            inset: '-15%',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(234,179,8,0.15), rgba(168,85,247,0.12), rgba(234,179,8,0.15))',
            opacity: 0.25,
            animation: `auraShimmer 8s linear infinite`,
            willChange: 'transform',
          }}
        />
      )}
    </div>
  );
}

const LEVEL_CONFIG: Partial<Record<AuraLevel, {
  gradient: string;
  opacity: number;
  duration: number;
  blur: number;
}>> = {
  Rising: {
    gradient: 'radial-gradient(ellipse at 40% 50%, rgba(59,130,246,0.2) 0%, rgba(96,165,250,0.08) 60%, transparent 100%)',
    opacity: 0.2,
    duration: 6,
    blur: 12,
  },
  Strong: {
    gradient: 'radial-gradient(ellipse at 45% 45%, rgba(168,85,247,0.25) 0%, rgba(139,92,246,0.1) 50%, transparent 100%)',
    opacity: 0.25,
    duration: 5,
    blur: 10,
  },
  Dominant: {
    gradient: 'radial-gradient(ellipse at 50% 40%, rgba(234,179,8,0.28) 0%, rgba(168,85,247,0.15) 45%, transparent 100%)',
    opacity: 0.28,
    duration: 4,
    blur: 8,
  },
};

const KEYFRAMES = `
@keyframes auraWave {
  0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
  50% { transform: scale(1.06) rotate(3deg); opacity: 1; }
  100% { transform: scale(1) rotate(-2deg); opacity: 0.85; }
}
@keyframes auraShimmer {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;
