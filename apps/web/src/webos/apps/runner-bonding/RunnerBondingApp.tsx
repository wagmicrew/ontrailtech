import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../core/theme-store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PoolStatus {
  current_supply: number;
  liquidity_pool: string;
  threshold: string;
  ready_for_tge: boolean;
}

interface PriceQuote {
  total_cost: string;
  current_supply: number;
  price_per_share: string;
}

interface ShareHolding {
  runner_id: string;
  runner_username: string | null;
  runner_avatar: string | null;
  amount: number;
  purchase_price: string;
  purchased_at: string;
}

interface Runner {
  id: string;
  username: string;
  avatar_url: string | null;
  reputation_score: number;
}

type Tab = 'trade' | 'portfolio' | 'tge';

// ── Bonding curve math (quadratic, matches server) ─────────────────────────────

const BASE = 0.001;
const K = 0.0001;

function curvePrice(supply: number): number {
  return BASE + K * supply * supply;
}

function buyCost(supply: number, amount: number): number {
  let total = 0;
  for (let i = 0; i < amount; i++) total += curvePrice(supply + i);
  return total;
}

// ── SVG Bonding Curve Chart ────────────────────────────────────────────────────

interface CurveChartProps {
  currentSupply: number;
  maxSupply?: number;
  width?: number;
  height?: number;
  dark?: boolean;
}

function CurveChart({ currentSupply, maxSupply = 500, width = 460, height = 180, dark }: CurveChartProps) {
  const PAD = { top: 16, right: 16, bottom: 36, left: 56 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const pts: [number, number][] = [];
  for (let s = 0; s <= maxSupply; s += Math.max(1, Math.floor(maxSupply / 100))) {
    pts.push([s, curvePrice(s)]);
  }
  const maxY = pts[pts.length - 1][1];

  function toX(s: number) { return PAD.left + (s / maxSupply) * W; }
  function toY(p: number) { return PAD.top + H - (p / maxY) * H; }

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`).join(' ');
  const fill = `${line} L${toX(maxSupply)},${PAD.top + H} L${PAD.left},${PAD.top + H} Z`;

  const curX = toX(currentSupply);
  const curY = toY(curvePrice(currentSupply));

  const textColor = dark ? '#e5e7eb' : '#374151';
  const gridColor = dark ? '#374151' : '#e5e7eb';
  const bgColor = dark ? '#1f2937' : '#f9fafb';

  // Y axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxY * f, y: toY(maxY * f) }));
  // X axis labels
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: Math.round(maxSupply * f), x: toX(maxSupply * f) }));

  return (
    <svg width={width} height={height} style={{ background: bgColor, borderRadius: 8 }}>
      {/* Grid lines */}
      {yTicks.map(t => (
        <line key={t.val} x1={PAD.left} y1={t.y} x2={PAD.left + W} y2={t.y}
          stroke={gridColor} strokeWidth={1} />
      ))}
      {/* Fill */}
      <path d={fill} fill="rgba(139,92,246,0.12)" />
      {/* Curve */}
      <path d={line} fill="none" stroke="#8b5cf6" strokeWidth={2} />
      {/* Current supply marker */}
      <line x1={curX} y1={PAD.top} x2={curX} y2={PAD.top + H} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" />
      <circle cx={curX} cy={curY} r={5} fill="#f59e0b" />
      {/* Y axis */}
      {yTicks.map(t => (
        <text key={t.val} x={PAD.left - 4} y={t.y + 4} textAnchor="end" fontSize={9} fill={textColor}>
          {t.val < 0.01 ? t.val.toFixed(5) : t.val.toFixed(4)}
        </text>
      ))}
      {/* X axis */}
      {xTicks.map(t => (
        <text key={t.val} x={t.x} y={PAD.top + H + 16} textAnchor="middle" fontSize={9} fill={textColor}>
          {t.val}
        </text>
      ))}
      <text x={PAD.left + W / 2} y={height - 2} textAnchor="middle" fontSize={9} fill={textColor}>Supply</text>
      <text x={10} y={PAD.top + H / 2} textAnchor="middle" fontSize={9} fill={textColor}
        transform={`rotate(-90, 10, ${PAD.top + H / 2})`}>ETH / share</text>
      {/* Legend */}
      <rect x={PAD.left + 4} y={PAD.top + 4} width={8} height={8} fill="#f59e0b" rx={2} />
      <text x={PAD.left + 16} y={PAD.top + 12} fontSize={9} fill={textColor}>
        Current supply: {currentSupply}
      </text>
    </svg>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ url, username, size = 36 }: { url?: string | null; username?: string | null; size?: number }) {
  const initials = (username || '?').slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={username || ''} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full bg-purple-200 text-purple-800 font-bold flex items-center justify-center flex-shrink-0 text-xs"
      style={{ width: size, height: size }}>{initials}</div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function RunnerBondingApp() {
  const { isConnected } = useAuth();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('trade');

  // Runner search
  const [searchQuery, setSearchQuery] = useState('');
  const [runners, setRunners] = useState<Runner[]>([]);
  const [runnersLoading, setRunnersLoading] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);

  // Trade
  const [amount, setAmount] = useState(1);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [pool, setPool] = useState<PoolStatus | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeMsg, setTradeMsg] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Portfolio (my share holdings)
  const [portfolio, setPortfolio] = useState<ShareHolding[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // TGE
  const [tgeRunners, setTgeRunners] = useState<(PoolStatus & { runner_id: string; username?: string })[]>([]);

  // ── Theming ────────────────────────────────────────────────────────────────

  const bg = `${theme.bg} ${theme.text}`;
  const card = `${theme.bgCard} ${theme.border}`;
  const muted = theme.textMuted;
  const inp = `${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`;
  const tabActive = 'border-b-2 border-purple-500 text-purple-600 font-semibold';
  const tabInactive = `border-b-2 border-transparent ${muted} hover:text-gray-600`;

  // ── Load runners ──────────────────────────────────────────────────────────

  const loadRunners = useCallback(async (q?: string) => {
    setRunnersLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await api.request<Runner[]>(`/users/leaderboard${params}`);
      setRunners(data.slice(0, 30));
    } catch { setRunners([]); }
    setRunnersLoading(false);
  }, []);

  useEffect(() => { loadRunners(); }, [loadRunners]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadRunners(searchQuery);
  };

  // ── Select runner → load price + pool ─────────────────────────────────────

  const selectRunner = async (runner: Runner) => {
    setSelectedRunner(runner);
    setQuote(null);
    setPool(null);
    setTradeMsg('');
    setQuoteLoading(true);
    try {
      const [q, p] = await Promise.all([
        api.getPrice(runner.id, amount),
        api.getPoolStatus(runner.id),
      ]);
      setQuote(q);
      setPool(p);
    } catch (e: any) { setTradeMsg(e.message); }
    setQuoteLoading(false);
  };

  // Re-quote when amount changes
  useEffect(() => {
    if (!selectedRunner) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const q = await api.getPrice(selectedRunner.id, amount);
        if (!cancelled) setQuote(q);
      } catch {}
    };
    fetch();
    return () => { cancelled = true; };
  }, [amount, selectedRunner]);

  // ── Buy ────────────────────────────────────────────────────────────────────

  const handleBuy = async () => {
    if (!selectedRunner) return;
    setTradeLoading(true);
    setTradeMsg('');
    try {
      const result = await api.buyShares(selectedRunner.id, amount);
      setTradeMsg(`✓ Bought ${result.amount} share${result.amount !== 1 ? 's' : ''} for ${result.price} ETH`);
      const p = await api.getPoolStatus(selectedRunner.id);
      setPool(p);
    } catch (e: any) { setTradeMsg(`❌ ${e.message}`); }
    setTradeLoading(false);
  };

  // ── Sell ───────────────────────────────────────────────────────────────────

  const handleSell = async () => {
    if (!selectedRunner) return;
    setTradeLoading(true);
    setTradeMsg('');
    try {
      const result = await api.sellShares(selectedRunner.id, amount);
      setTradeMsg(`✓ Sold ${result.amount} share${result.amount !== 1 ? 's' : ''} for ${result.price} ETH`);
      const p = await api.getPoolStatus(selectedRunner.id);
      setPool(p);
    } catch (e: any) { setTradeMsg(`❌ ${e.message}`); }
    setTradeLoading(false);
  };

  // ── Portfolio ──────────────────────────────────────────────────────────────

  const loadPortfolio = useCallback(async () => {
    if (!isConnected) return;
    setPortfolioLoading(true);
    try {
      const data = await api.getMyShareHoldings();
      setPortfolio(data);
    } catch { setPortfolio([]); }
    setPortfolioLoading(false);
  }, [isConnected]);

  useEffect(() => { if (tab === 'portfolio') loadPortfolio(); }, [tab, loadPortfolio]);

  // ── TGE pipeline ──────────────────────────────────────────────────────────

  const loadTge = useCallback(async () => {
    // Load top runners and their pool status (parallel)
    try {
      const leadersData = await api.request<Runner[]>('/users/leaderboard');
      const pools = await Promise.allSettled(
        leadersData.slice(0, 10).map(r =>
          api.getPoolStatus(r.id).then(p => ({ ...p, runner_id: r.id, username: r.username }))
        )
      );
      setTgeRunners(
        pools
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value)
          .sort((a, b) => parseFloat(b.liquidity_pool) - parseFloat(a.liquidity_pool))
      );
    } catch {}
  }, []);

  useEffect(() => { if (tab === 'tge') loadTge(); }, [tab, loadTge]);

  // ── TGE progress bar ──────────────────────────────────────────────────────

  function TgeBar({ pool: p }: { pool: PoolStatus }) {
    const pct = Math.min(100, (parseFloat(p.liquidity_pool) / Math.max(0.001, parseFloat(p.threshold))) * 100);
    const color = p.ready_for_tge ? '#10b981' : pct > 60 ? '#f59e0b' : '#8b5cf6';
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div style={{ width: `${pct}%`, background: color }} className="h-2 rounded-full transition-all" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${theme.border}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <div>
            <h1 className="text-lg font-bold">Runner Bonding</h1>
            <p className={`text-xs ${muted}`}>Trade runner shares on a quadratic bonding curve · price = 0.001 + 0.0001 × supply²</p>
          </div>
        </div>
        <div className="flex gap-6 mt-3">
          {(['trade', 'portfolio', 'tge'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-1 text-sm capitalize ${tab === t ? tabActive : tabInactive}`}>
              {t === 'trade' ? 'Trade' : t === 'portfolio' ? 'My Portfolio' : 'TGE Pipeline'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Trade Tab ────────────────────────────────────────────────────── */}
        {tab === 'trade' && (
          <>
            {/* Runner list sidebar */}
            <div className={`w-60 border-r ${theme.border} flex flex-col overflow-hidden`}>
              <form onSubmit={handleSearch} className="p-3 border-b border-inherit">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search runners…"
                  className={`w-full border rounded px-3 py-1.5 text-sm ${inp}`} />
              </form>
              <div className="flex-1 overflow-y-auto">
                {runnersLoading ? (
                  <div className={`p-4 text-sm text-center ${muted}`}>Loading…</div>
                ) : runners.map(r => (
                  <button key={r.id} onClick={() => selectRunner(r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 text-left transition-colors ${selectedRunner?.id === r.id ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}>
                    <Avatar url={r.avatar_url} username={r.username} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{r.username || 'Anonymous'}</p>
                      <p className={`text-xs ${muted}`}>Rep {r.reputation_score?.toFixed(0) ?? '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Trade panel */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {!selectedRunner ? (
                <div className={`flex items-center justify-center h-full text-sm ${muted}`}>
                  Select a runner to trade their shares
                </div>
              ) : (
                <>
                  {/* Runner header */}
                  <div className="flex items-center gap-3">
                    <Avatar url={selectedRunner.avatar_url} username={selectedRunner.username} size={48} />
                    <div>
                      <h2 className="font-bold text-lg">{selectedRunner.username || 'Anonymous'}</h2>
                      <p className={`text-xs ${muted}`}>
                        {pool
                          ? `${pool.current_supply} shares · ${pool.liquidity_pool} ETH pool`
                          : quoteLoading ? 'Loading…' : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Bonding curve chart */}
                  {pool && (
                    <CurveChart
                      currentSupply={pool.current_supply}
                      maxSupply={Math.max(100, pool.current_supply + 100)}
                      dark={theme.scrollbar === 'dark'}
                    />
                  )}

                  {/* Trade controls */}
                  <div className={`border rounded-xl p-4 space-y-4 ${card}`}>
                    <div className="flex items-center gap-3">
                      <label className={`text-sm font-medium ${muted} w-16`}>Amount</label>
                      <input type="number" value={amount} min={1} max={100}
                        onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        className={`border rounded px-3 py-1.5 text-sm w-24 ${inp}`} />
                    </div>

                    {quote && (
                      <div className={`rounded-lg p-3 text-sm space-y-1 ${theme.bgActive}`}>
                        <div className="flex justify-between">
                          <span className={muted}>Price / share</span>
                          <span className="font-mono">{parseFloat(quote.price_per_share).toFixed(6)} ETH</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Total</span>
                          <span className="font-mono text-purple-600">{parseFloat(quote.total_cost).toFixed(6)} ETH</span>
                        </div>
                      </div>
                    )}

                    {/* Local preview of sell price */}
                    {pool && (
                      <p className={`text-xs ${muted}`}>
                        Sell {amount} → ~{buyCost(Math.max(0, pool.current_supply - amount), amount).toFixed(6)} ETH
                      </p>
                    )}

                    {isConnected ? (
                      <div className="flex gap-2">
                        <button onClick={handleBuy} disabled={tradeLoading || !selectedRunner}
                          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                          {tradeLoading ? '…' : 'Buy'}
                        </button>
                        <button onClick={handleSell} disabled={tradeLoading || !selectedRunner}
                          className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                          {tradeLoading ? '…' : 'Sell'}
                        </button>
                      </div>
                    ) : (
                      <p className={`text-xs text-center ${muted}`}>Connect wallet to trade</p>
                    )}

                    {tradeMsg && (
                      <p className={`text-sm ${tradeMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                        {tradeMsg}
                      </p>
                    )}
                  </div>

                  {/* Pool status */}
                  {pool && (
                    <div className={`border rounded-xl p-4 space-y-3 ${card}`}>
                      <p className={`text-xs uppercase tracking-wide ${muted}`}>Pool Status</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                          { label: 'Supply', value: pool.current_supply },
                          { label: 'Pool', value: `${parseFloat(pool.liquidity_pool).toFixed(4)} ETH` },
                          { label: 'TGE Threshold', value: `${parseFloat(pool.threshold).toFixed(2)} ETH` },
                          { label: 'Status', value: pool.ready_for_tge ? '🚀 TGE Ready' : '📈 Bonding' },
                        ].map(s => (
                          <div key={s.label}>
                            <span className={`text-xs ${muted}`}>{s.label}</span>
                            <p className="font-semibold text-sm">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      {/* TGE progress */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={muted}>TGE Progress</span>
                          <span>{Math.min(100, (parseFloat(pool.liquidity_pool) / Math.max(0.001, parseFloat(pool.threshold))) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div style={{
                            width: `${Math.min(100, (parseFloat(pool.liquidity_pool) / Math.max(0.001, parseFloat(pool.threshold))) * 100)}%`,
                            background: pool.ready_for_tge ? '#10b981' : '#8b5cf6',
                          }} className="h-2 rounded-full transition-all" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── Portfolio Tab ─────────────────────────────────────────────────── */}
        {tab === 'portfolio' && (
          <div className="flex-1 overflow-y-auto p-6">
            {!isConnected ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Connect wallet to view portfolio</div>
            ) : portfolioLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : portfolio.length === 0 ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>No shares held yet. Buy some from the Trade tab.</div>
            ) : (
              <div className="max-w-2xl space-y-3">
                <p className={`text-xs uppercase tracking-wide ${muted} mb-2`}>{portfolio.length} position{portfolio.length !== 1 ? 's' : ''}</p>
                {portfolio.map((h, i) => (
                  <div key={i} className={`border rounded-xl p-4 flex items-center gap-4 ${card}`}>
                    <Avatar url={h.runner_avatar} username={h.runner_username} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{h.runner_username || 'Unknown'}</p>
                      <p className={`text-xs ${muted}`}>
                        {h.amount} share{h.amount !== 1 ? 's' : ''} · Bought {new Date(h.purchased_at).toLocaleDateString()}
                      </p>
                      <p className={`text-xs font-mono ${muted}`}>Cost: {h.purchase_price} ETH</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TGE Pipeline Tab ─────────────────────────────────────────────── */}
        {tab === 'tge' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl space-y-3">
              <div className={`border rounded-xl p-4 mb-4 ${card}`}>
                <p className={`text-sm ${muted}`}>
                  When a runner's liquidity pool reaches the <strong>TGE threshold</strong>, their Runner Token launches.
                  Pool liquidity migrates to Raydium (Solana) or a DEX. Early share holders get priority token allocation.
                </p>
              </div>
              {tgeRunners.map(p => {
                const pct = Math.min(100, (parseFloat(p.liquidity_pool) / Math.max(0.001, parseFloat(p.threshold))) * 100);
                return (
                  <div key={p.runner_id} className={`border rounded-xl p-4 ${card}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{p.username || p.runner_id.slice(0, 8)}</span>
                      {p.ready_for_tge ? (
                        <span className="text-xs bg-green-100 text-green-600 border border-green-200 px-2 py-0.5 rounded font-semibold">
                          🚀 TGE Ready
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-purple-600">{pct.toFixed(1)}%</span>
                      )}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div style={{ width: `${pct}%`, background: p.ready_for_tge ? '#10b981' : '#8b5cf6' }}
                        className="h-2 rounded-full" />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className={muted}>{parseFloat(p.liquidity_pool).toFixed(4)} ETH pooled</span>
                      <span className={muted}>target {parseFloat(p.threshold).toFixed(2)} ETH</span>
                    </div>
                  </div>
                );
              })}
              {tgeRunners.length === 0 && (
                <div className={`text-sm text-center mt-20 ${muted}`}>No runner pools found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
