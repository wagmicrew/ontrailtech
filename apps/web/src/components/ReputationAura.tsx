import { useRef, useEffect, useCallback } from 'react';
import { FluidSimulation } from '../lib/fluid-simulation';

/**
 * Aura level determines visual intensity.
 * Maps to the Ancient Aura System spec levels.
 */
export type AuraLevel = 'None' | 'Low' | 'Rising' | 'Strong' | 'Dominant';

/** Color palettes per aura level (RGB 0–1) */
const AURA_COLORS: Record<Exclude<AuraLevel, 'None'>, [number, number, number][]> = {
  Low:      [[0.4, 0.4, 0.5], [0.3, 0.3, 0.45]],
  Rising:   [[0.2, 0.4, 0.9], [0.1, 0.3, 0.8], [0.3, 0.5, 1.0]],
  Strong:   [[0.5, 0.2, 0.8], [0.6, 0.1, 0.9], [0.4, 0.3, 1.0]],
  Dominant: [[0.9, 0.7, 0.1], [0.8, 0.5, 0.9], [1.0, 0.8, 0.2], [0.7, 0.3, 1.0]],
};

/** Fluid config tuned per aura level */
const AURA_CONFIGS: Record<Exclude<AuraLevel, 'None'>, {
  splatRadius: number;
  curl: number;
  densityDissipation: number;
  velocityDissipation: number;
  splatInterval: number;   // ms between auto-splats
  splatStrength: number;   // velocity multiplier
  splatCount: number;      // splats per interval
}> = {
  Low: {
    splatRadius: 0.003,
    curl: 15,
    densityDissipation: 0.95,
    velocityDissipation: 0.97,
    splatInterval: 400,
    splatStrength: 80,
    splatCount: 1,
  },
  Rising: {
    splatRadius: 0.005,
    curl: 25,
    densityDissipation: 0.97,
    velocityDissipation: 0.98,
    splatInterval: 300,
    splatStrength: 120,
    splatCount: 2,
  },
  Strong: {
    splatRadius: 0.007,
    curl: 35,
    densityDissipation: 0.98,
    velocityDissipation: 0.99,
    splatInterval: 200,
    splatStrength: 180,
    splatCount: 3,
  },
  Dominant: {
    splatRadius: 0.009,
    curl: 45,
    densityDissipation: 0.985,
    velocityDissipation: 0.995,
    splatInterval: 120,
    splatStrength: 250,
    splatCount: 4,
  },
};

interface ReputationAuraProps {
  /** Aura level from the backend */
  auraLevel: AuraLevel;
  /** Reputation score 0–100, drives ring fill and aura intensity */
  reputation: number;
  /** Size of the container in px (the ring area) */
  size?: number;
  /** How far the aura extends beyond the ring, in px */
  auraSpread?: number;
  /** The children (activity rings) rendered on top */
  children: React.ReactNode;
}

export default function ReputationAura({
  auraLevel,
  reputation,
  size = 144,
  auraSpread = 40,
  children,
}: ReputationAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<FluidSimulation | null>(null);
  const rafRef = useRef<number>(0);
  const splatTimerRef = useRef<number>(0);

  // Total canvas size includes the aura spread on all sides
  const canvasSize = size + auraSpread * 2;

  // Ring geometry in normalized coords (0–1)
  const ringCenter = 0.5;
  // Outer ring radius in normalized space (the outermost activity ring)
  const outerRingRadius = (size * 0.5) / canvasSize;
  // Inner ring radius (innermost activity ring)
  const innerRingRadius = (size * 0.2) / canvasSize;

  const pickColor = useCallback((level: Exclude<AuraLevel, 'None'>): [number, number, number] => {
    const palette = AURA_COLORS[level];
    return palette[Math.floor(Math.random() * palette.length)];
  }, []);

  /**
   * Generate a splat position on or near the ring circumference,
   * with velocity pointing outward — creating the "originating from ring" effect.
   */
  const generateRingSplat = useCallback((level: Exclude<AuraLevel, 'None'>) => {
    const cfg = AURA_CONFIGS[level];
    const angle = Math.random() * Math.PI * 2;

    // Position: on the outer ring edge with slight random offset
    const radiusJitter = (Math.random() - 0.5) * 0.06;
    const r = outerRingRadius + radiusJitter;
    const x = ringCenter + Math.cos(angle) * r;
    const y = ringCenter + Math.sin(angle) * r;

    // Velocity: outward from center with tangential component for swirl
    const outwardX = Math.cos(angle);
    const outwardY = Math.sin(angle);
    // Add tangential component for fluid swirl
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const tangentMix = 0.4 + Math.random() * 0.3;

    const dx = (outwardX * (1 - tangentMix) + tangentX * tangentMix) * cfg.splatStrength;
    const dy = (outwardY * (1 - tangentMix) + tangentY * tangentMix) * cfg.splatStrength;

    const color = pickColor(level);
    // Scale color by reputation intensity (0.3 base + 0.7 scaled)
    const intensity = 0.3 + (reputation / 100) * 0.7;

    return {
      x, y, dx, dy,
      color: [
        color[0] * intensity,
        color[1] * intensity,
        color[2] * intensity,
      ] as [number, number, number],
    };
  }, [outerRingRadius, ringCenter, reputation, pickColor]);

  useEffect(() => {
    if (auraLevel === 'None') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution (use 1x for performance, the fluid is soft anyway)
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    canvas.width = Math.round(canvasSize * dpr);
    canvas.height = Math.round(canvasSize * dpr);

    const levelCfg = AURA_CONFIGS[auraLevel];

    try {
      const sim = new FluidSimulation(canvas, {
        textureDownsample: 1,
        densityDissipation: levelCfg.densityDissipation,
        velocityDissipation: levelCfg.velocityDissipation,
        pressureDissipation: 0.8,
        pressureIterations: 20,
        curl: levelCfg.curl,
        splatRadius: levelCfg.splatRadius,
      });
      simRef.current = sim;

      // Initial burst of splats around the ring
      for (let i = 0; i < levelCfg.splatCount * 3; i++) {
        sim.addSplat(generateRingSplat(auraLevel));
      }

      // Animation loop
      let lastSplat = Date.now();
      const tick = () => {
        sim.update();

        // Auto-inject splats at configured interval
        const now = Date.now();
        if (now - lastSplat > levelCfg.splatInterval) {
          lastSplat = now;
          for (let i = 0; i < levelCfg.splatCount; i++) {
            sim.addSplat(generateRingSplat(auraLevel));
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('WebGL fluid aura not available:', e);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(splatTimerRef.current);
      simRef.current?.destroy();
      simRef.current = null;
    };
  }, [auraLevel, canvasSize, generateRingSplat]);

  if (auraLevel === 'None') {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        {children}
      </div>
    );
  }

  // CSS circular mask: donut shape from inner ring outward
  // The fluid is visible from just inside the outer ring to the full canvas edge
  const maskInnerPct = (innerRingRadius / 0.5) * 50;

  return (
    <div
      className="relative"
      style={{ width: canvasSize, height: canvasSize }}
    >
      {/* WebGL fluid canvas — behind the rings */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: canvasSize,
          height: canvasSize,
          // Circular mask: show fluid in a donut from inner ring to edge
          maskImage: `radial-gradient(circle at center, transparent ${maskInnerPct}%, black ${maskInnerPct + 8}%)`,
          WebkitMaskImage: `radial-gradient(circle at center, transparent ${maskInnerPct}%, black ${maskInnerPct + 8}%)`,
          opacity: auraLevel === 'Low' ? 0.15 : auraLevel === 'Rising' ? 0.22 : auraLevel === 'Strong' ? 0.28 : 0.35,
          filter: 'blur(2px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Children (activity rings) centered within the aura spread */}
      <div
        className="absolute"
        style={{
          top: auraSpread,
          left: auraSpread,
          width: size,
          height: size,
        }}
      >
        {children}
      </div>
    </div>
  );
}
