import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../core/theme-store';

// ─── Types ────────────────────────────────────────────────────────────────────

type CurveType = 'linear' | 'exponential' | 'sigmoid' | 'pumpfun';

interface CurveParams {
  id: string;
  label: string;
  curveType: CurveType;
  basePrice: number;
  k: number;
  maxSupply: number;
  initialSupply: number;
  maxPrice: number; // used for sigmoid ceiling
  midpoint: number; // used for sigmoid
  visible: boolean;
  color: string;
}

const CURVE_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

const CURVE_DESCRIPTIONS: Record<CurveType, string> = {
  linear: 'price = base + k × supply — simple linear growth',
  exponential: 'price = base × eᵏˢ — accelerating growth',
  sigmoid: 'price = max / (1 + e^(−k×(supply−mid))) — S-curve with ceiling',
  pumpfun: 'price = base + k × supply² — pump.fun quadratic model',
};

function makeCurve(id: string, overrides: Partial<CurveParams> = {}): CurveParams {
  return {
    id,
    label: `Curve ${id}`,
    curveType: 'pumpfun',
    basePrice: 0.000001,
    k: 0.0001,
    maxSupply: 1_000_000_000,
    initialSupply: 0,
    maxPrice: 0.01,
    midpoint: 500_000_000,
    visible: true,
    color: CURVE_COLORS[parseInt(id) % CURVE_COLORS.length],
    ...overrides,
  };
}

// ─── Price formula ────────────────────────────────────────────────────────────

function calcPrice(c: CurveParams, supply: number): number {
  switch (c.curveType) {
    case 'linear':
      return Math.max(0, c.basePrice + c.k * supply);
    case 'exponential':
      return Math.max(0, c.basePrice * Math.exp(c.k * supply));
    case 'sigmoid':
      return c.maxPrice / (1 + Math.exp(-c.k * (supply - c.midpoint)));
    case 'pumpfun':
      return Math.max(0, c.basePrice + c.k * supply * supply);
    default:
      return 0;
  }
}

function calcMarketCap(c: CurveParams, supply: number): number {
  return calcPrice(c, supply) * supply;
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────

const SVG_W = 560;
const SVG_H = 260;
const PADDING = { top: 20, right: 20, bottom: 40, left: 60 };

function CurveChart({ curves, supply }: { curves: CurveParams[]; supply: number }) {
  const t = useTheme();

  const visibleCurves = curves.filter(c => c.visible);
  const STEPS = 200;

  // Calculate axes bounds across all visible curves
  let maxY = 0;
  let maxX = 1;
  for (const c of visibleCurves) {
    maxX = Math.max(maxX, c.maxSupply);
    for (let i = 0; i <= STEPS; i++) {
      const x = (c.maxSupply * i) / STEPS;
      const y = calcPrice(c, x);
      if (isFinite(y) && y < 1e18) maxY = Math.max(maxY, y);
    }
  }
  if (maxY === 0) maxY = 1;

  const plotW = SVG_W - PADDING.left - PADDING.right;
  const plotH = SVG_H - PADDING.top - PADDING.bottom;

  function toSvgX(x: number) { return PADDING.left + (x / maxX) * plotW; }
  function toSvgY(y: number) { return PADDING.top + plotH - Math.min((y / maxY) * plotH, plotH); }

  function buildPath(c: CurveParams) {
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = (c.maxSupply * i) / STEPS;
      const y = calcPrice(c, x);
      if (!isFinite(y) || y > maxY * 2) continue;
      pts.push(`${toSvgX(x).toFixed(2)},${toSvgY(y).toFixed(2)}`);
    }
    return pts.length < 2 ? '' : `M${pts.join('L')}`;
  }

  // current supply marker
  const markerX = toSvgX(supply);

  // Y axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: maxY * f,
    y: toSvgY(maxY * f),
  }));
  // X axis ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: maxX * f,
    x: toSvgX(maxX * f),
  }));

  function fmtNum(n: number) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n < 0.001) return n.toExponential(1);
    return n.toFixed(4);
  }

  const gridColor = 'rgba(139,92,246,0.08)';
  const axisColor = 'rgba(139,92,246,0.3)';
  const textColor = '#94a3b8';

  return (
    <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ fontFamily: 'inherit' }}>
      {/* Grid lines */}
      {yTicks.map((tk, i) => (
        <line key={i} x1={PADDING.left} x2={SVG_W - PADDING.right} y1={tk.y} y2={tk.y} stroke={gridColor} strokeWidth="1" />
      ))}
      {xTicks.map((tk, i) => (
        <line key={i} x1={tk.x} x2={tk.x} y1={PADDING.top} y2={SVG_H - PADDING.bottom} stroke={gridColor} strokeWidth="1" />
      ))}

      {/* Axes */}
      <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={SVG_H - PADDING.bottom} stroke={axisColor} strokeWidth="1" />
      <line x1={PADDING.left} x2={SVG_W - PADDING.right} y1={SVG_H - PADDING.bottom} y2={SVG_H - PADDING.bottom} stroke={axisColor} strokeWidth="1" />

      {/* Axis labels */}
      {yTicks.map((tk, i) => (
        <text key={i} x={PADDING.left - 6} y={tk.y + 4} textAnchor="end" fontSize="9" fill={textColor}>
          {fmtNum(tk.value)}
        </text>
      ))}
      {xTicks.map((tk, i) => (
        <text key={i} x={tk.x} y={SVG_H - PADDING.bottom + 14} textAnchor="middle" fontSize="9" fill={textColor}>
          {fmtNum(tk.value)}
        </text>
      ))}
      <text x={PADDING.left - 45} y={PADDING.top + plotH / 2} transform={`rotate(-90, ${PADDING.left - 45}, ${PADDING.top + plotH / 2})`} textAnchor="middle" fontSize="9" fill={textColor}>
        Price (ETH)
      </text>
      <text x={PADDING.left + plotW / 2} y={SVG_H - 4} textAnchor="middle" fontSize="9" fill={textColor}>
        Supply
      </text>

      {/* Curves */}
      {visibleCurves.map(c => {
        const d = buildPath(c);
        if (!d) return null;
        return (
          <path key={c.id} d={d} fill="none" stroke={c.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        );
      })}

      {/* Current supply vertical marker */}
      {supply > 0 && (
        <>
          <line x1={markerX} x2={markerX} y1={PADDING.top} y2={SVG_H - PADDING.bottom} stroke="rgba(251,191,36,0.6)" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={markerX + 3} y={PADDING.top + 10} fontSize="8" fill="rgb(251,191,36)">supply</text>
        </>
      )}
    </svg>
  );
}

// ─── Single curve editor ──────────────────────────────────────────────────────

function CurveEditor({
  curve,
  onChange,
  onRemove,
  canRemove,
  t,
}: {
  curve: CurveParams;
  onChange: (c: CurveParams) => void;
  onRemove: () => void;
  canRemove: boolean;
  t: ReturnType<typeof useTheme>;
}) {
  function set<K extends keyof CurveParams>(k: K, v: CurveParams[K]) {
    onChange({ ...curve, [k]: v });
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${t.border} ${t.bgCard}`} style={{ borderLeftColor: curve.color, borderLeftWidth: 3 }}>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: curve.color }} />
        <input
          value={curve.label}
          onChange={e => set('label', e.target.value)}
          className={`flex-1 text-xs font-semibold bg-transparent border-none outline-none ${t.text}`}
          placeholder="Curve label"
        />
        <button onClick={() => set('visible', !curve.visible)}
          className={`text-[10px] px-2 py-0.5 rounded border ${t.border} transition-colors ${curve.visible ? 'text-violet-400 border-violet-500/40' : `${t.textMuted}`}`}>
          {curve.visible ? 'visible' : 'hidden'}
        </button>
        {canRemove && (
          <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={`text-[10px] mb-1 ${t.textMuted}`}>Curve type</p>
          <select
            value={curve.curveType}
            onChange={e => set('curveType', e.target.value as CurveType)}
            className={`w-full text-[11px] px-2 py-1.5 rounded-lg border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}
          >
            <option value="pumpfun">pump.fun (quadratic)</option>
            <option value="linear">Linear</option>
            <option value="exponential">Exponential</option>
            <option value="sigmoid">Sigmoid (S-curve)</option>
          </select>
          <p className={`text-[9px] mt-1 ${t.textMuted} leading-3`}>{CURVE_DESCRIPTIONS[curve.curveType]}</p>
        </div>
        <div className="space-y-1.5">
          <SimField label="Base price (ETH)" value={curve.basePrice} onChange={v => set('basePrice', v)} step="0.0000001" t={t} />
          <SimField label="K (slope / exponent)" value={curve.k} onChange={v => set('k', v)} step="0.000001" t={t} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SimField label="Max supply" value={curve.maxSupply} onChange={v => set('maxSupply', v)} step="1000000" t={t} isInt />
        <SimField label="Initial supply" value={curve.initialSupply} onChange={v => set('initialSupply', v)} step="1000000" t={t} isInt />
        {curve.curveType === 'sigmoid' && (
          <>
            <SimField label="Max price ceiling" value={curve.maxPrice} onChange={v => set('maxPrice', v)} step="0.001" t={t} />
            <SimField label="Midpoint supply" value={curve.midpoint} onChange={v => set('midpoint', v)} step="1000000" t={t} isInt />
          </>
        )}
      </div>
    </div>
  );
}

function SimField({ label, value, onChange, step, t, isInt }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: string;
  t: ReturnType<typeof useTheme>;
  isInt?: boolean;
}) {
  return (
    <div>
      <p className={`text-[10px] mb-1 ${t.textMuted}`}>{label}</p>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(isInt ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
        className={`w-full text-[11px] font-mono px-2 py-1.5 rounded-lg border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}
      />
    </div>
  );
}

// ─── Stats panel ─────────────────────────────────────────────────────────────

function StatsPanel({ curves, supply, t }: { curves: CurveParams[]; supply: number; t: ReturnType<typeof useTheme> }) {
  function fmtEth(n: number) {
    if (!isFinite(n)) return '∞';
    if (n < 0.000001) return n.toExponential(2) + ' ETH';
    return n.toFixed(8) + ' ETH';
  }
  function fmtUsd(ethPrice: number, usd = 3200) {
    const v = ethPrice * usd;
    if (!isFinite(v)) return '—';
    if (v < 0.01) return `$${(v * 1000).toFixed(2)}m`;
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  const visibleCurves = curves.filter(c => c.visible);

  return (
    <div className="space-y-2">
      <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted}`}>At current supply ({supply.toLocaleString()})</p>
      {visibleCurves.map(c => {
        const price = calcPrice(c, supply);
        const mcap = calcMarketCap(c, supply);
        const fdv = calcMarketCap(c, c.maxSupply);
        return (
          <div key={c.id} className={`rounded-xl border p-3 space-y-1 ${t.border} ${t.bgCard}`} style={{ borderLeftColor: c.color, borderLeftWidth: 3 }}>
            <p className="text-xs font-semibold" style={{ color: c.color }}>{c.label}</p>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <p className={t.textMuted}>Price</p>
                <p className={`font-mono ${t.text}`}>{fmtEth(price)}</p>
                <p className={t.textMuted}>{fmtUsd(price)}</p>
              </div>
              <div>
                <p className={t.textMuted}>Mkt Cap</p>
                <p className={`font-mono ${t.text}`}>{fmtEth(mcap)}</p>
                <p className={t.textMuted}>{fmtUsd(mcap)}</p>
              </div>
              <div>
                <p className={t.textMuted}>FDV</p>
                <p className={`font-mono ${t.text}`}>{fmtEth(fdv)}</p>
                <p className={t.textMuted}>{fmtUsd(fdv)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Export panel ─────────────────────────────────────────────────────────────

function ExportPanel({ curves, t }: { curves: CurveParams[]; t: ReturnType<typeof useTheme> }) {
  const [copied, setCopied] = useState(false);

  function exportJson() {
    const out = curves.filter(c => c.visible).map(c => ({
      label: c.label,
      curveType: c.curveType,
      basePrice: c.basePrice,
      k: c.k,
      maxSupply: c.maxSupply,
      tgeThreshold: c.midpoint,
    }));
    navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportRunnerCoin() {
    const first = curves.find(c => c.visible);
    if (!first) return;
    const out = {
      bonding_curve_k: first.k.toString(),
      base_price: first.basePrice.toString(),
      total_supply: first.maxSupply.toString(),
      tge_threshold: first.midpoint.toString(),
    };
    navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${t.border} ${t.bgCard}`}>
      <p className={`text-xs font-semibold ${t.text}`}>Export Config</p>
      <div className="flex gap-2">
        <button onClick={exportJson}
          className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors">
          {copied ? 'Copied!' : 'Copy as JSON'}
        </button>
        <button onClick={exportRunnerCoin}
          className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-medium border ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 transition-colors`}>
          Copy for RunnerCoin tab
        </button>
      </div>
      <p className={`text-[10px] ${t.textMuted}`}>
        JSON output is ready to paste into the Runner Coin tab in Alchemy OS, or use as parameters for smart contract deployment.
      </p>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

let _nextId = 2;

export default function BondingSimApp() {
  const t = useTheme();
  const [curves, setCurves] = useState<CurveParams[]>([
    makeCurve('1', { label: 'pump.fun (baseline)', curveType: 'pumpfun', k: 0.0001, basePrice: 0.000001, color: CURVE_COLORS[0] }),
    makeCurve('2', { label: 'Linear comparison', curveType: 'linear', k: 0.000000001, basePrice: 0.000001, visible: true, color: CURVE_COLORS[1] }),
  ]);
  const [supply, setSupply] = useState(200_000_000);

  function updateCurve(id: string, updated: CurveParams) {
    setCurves(prev => prev.map(c => (c.id === id ? updated : c)));
  }

  function addCurve() {
    const id = String(++_nextId);
    setCurves(prev => [
      ...prev,
      makeCurve(id, { label: `Curve ${id}`, curveType: 'pumpfun', color: CURVE_COLORS[_nextId % CURVE_COLORS.length] }),
    ]);
  }

  function removeCurve(id: string) {
    setCurves(prev => prev.filter(c => c.id !== id));
  }

  const maxMaxSupply = Math.max(...curves.map(c => c.maxSupply), 1_000_000_000);

  return (
    <div className={`flex h-full overflow-hidden ${t.bg}`}>
      {/* Left panel — editors */}
      <div className={`w-80 flex-shrink-0 border-r ${t.border} flex flex-col overflow-hidden`}>
        <div className={`px-4 py-3 border-b ${t.border} flex-shrink-0`}>
          <h2 className={`text-sm font-semibold ${t.heading}`}>Bonding Curve Sim</h2>
          <p className={`text-[10px] ${t.textMuted}`}>Compare algorithms before launch</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {curves.map(c => (
            <CurveEditor
              key={c.id}
              curve={c}
              onChange={updated => updateCurve(c.id, updated)}
              onRemove={() => removeCurve(c.id)}
              canRemove={curves.length > 1}
              t={t}
            />
          ))}
          <button onClick={addCurve}
            className={`w-full py-2 rounded-xl border border-dashed text-xs ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 transition-colors`}>
            + Add curve
          </button>
        </div>
      </div>

      {/* Right panel — chart + stats */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Chart */}
        <div className={`rounded-2xl border p-4 ${t.border} ${t.bgCard}`}>
          <div className="flex items-center gap-3 mb-3">
            {curves.filter(c => c.visible).map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5" style={{ background: c.color }} />
                <span className={`text-[10px] ${t.textMuted}`}>{c.label}</span>
              </div>
            ))}
          </div>
          <CurveChart curves={curves} supply={supply} />
        </div>

        {/* Supply slider */}
        <div className={`rounded-2xl border p-4 space-y-2 ${t.border} ${t.bgCard}`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs font-medium ${t.text}`}>Simulate supply</p>
            <span className={`text-xs font-mono text-violet-400`}>{supply.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={0}
            max={maxMaxSupply}
            step={Math.floor(maxMaxSupply / 1000)}
            value={supply}
            onChange={e => setSupply(parseInt(e.target.value))}
            className="w-full accent-violet-500"
          />
          <div className="flex justify-between">
            <span className={`text-[10px] ${t.textMuted}`}>0</span>
            <span className={`text-[10px] ${t.textMuted}`}>{(maxMaxSupply / 1e6).toFixed(0)}M</span>
          </div>
        </div>

        {/* Stats */}
        <StatsPanel curves={curves} supply={supply} t={t} />

        {/* Export */}
        <ExportPanel curves={curves} t={t} />
      </div>
    </div>
  );
}
