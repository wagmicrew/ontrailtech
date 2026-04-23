import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../core/theme-store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Runner {
  id: string;
  username: string;
  avatar_url: string | null;
  reputation_score: number;
}

interface PriceInfo {
  currentPrice: string;
  currentPriceFiat: string;
  nextPrice: string;
  currentSupply: number;
  maxSupply: number;
  benefits: string[];
}

interface Holding {
  holding_id: string;
  runner_id: string;
  runner_username: string | null;
  runner_avatar: string | null;
  passes: number;
  purchase_price_eth: string;
  purchased_at: string;
  sold: boolean;
}

interface Holder {
  owner_id: string;
  username: string | null;
  avatar_url: string | null;
  passes: number;
  purchased_at: string;
}

type Tab = 'browse' | 'holdings' | 'my-holders';

// ── Helpers ────────────────────────────────────────────────────────────────────

function RarityBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, (current / Math.max(1, max)) * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#10b981';
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
      <div style={{ width: `${pct}%`, background: color }} className="h-1.5 rounded-full transition-all" />
    </div>
  );
}

function Avatar({ url, username, size = 36 }: { url?: string | null; username?: string | null; size?: number }) {
  const initials = (username || '?').slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt={username || ''} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-purple-200 text-purple-800 font-bold flex items-center justify-center flex-shrink-0 text-xs"
      style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function FriendFiApp() {
  const { isConnected, userId } = useAuth();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('browse');

  // Browse tab
  const [searchQuery, setSearchQuery] = useState('');
  const [runners, setRunners] = useState<Runner[]>([]);
  const [runnersLoading, setRunnersLoading] = useState(false);

  // Selected runner for price / buy
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyMsg, setBuyMsg] = useState('');

  // Holdings tab
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [sellingId, setSellingId] = useState<string | null>(null);

  // My-holders tab
  const [myHolders, setMyHolders] = useState<Holder[]>([]);
  const [myHoldersLoading, setMyHoldersLoading] = useState(false);

  // ── Load runners (leaderboard / search) ──────────────────────────────────

  const loadRunners = useCallback(async (q?: string) => {
    setRunnersLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await api.request<Runner[]>(`/users/leaderboard${params}`);
      setRunners(data.slice(0, 30));
    } catch {
      setRunners([]);
    }
    setRunnersLoading(false);
  }, []);

  useEffect(() => { loadRunners(); }, [loadRunners]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadRunners(searchQuery);
  };

  // ── Select runner ──────────────────────────────────────────────────────────

  const selectRunner = async (runner: Runner) => {
    setSelectedRunner(runner);
    setPriceInfo(null);
    setHolders([]);
    setBuyMsg('');
    setPriceLoading(true);
    try {
      const [price, holderList] = await Promise.all([
        api.getFriendPassPrice(runner.id),
        api.getFriendPassHolders(runner.id),
      ]);
      setPriceInfo(price);
      setHolders(holderList);
    } catch (e: any) {
      setBuyMsg(e.message || 'Failed to load price');
    }
    setPriceLoading(false);
  };

  // ── Buy ────────────────────────────────────────────────────────────────────

  const handleBuy = async () => {
    if (!selectedRunner) return;
    setBuying(true);
    setBuyMsg('');
    try {
      const result = await api.buyFriendPass(selectedRunner.id);
      setBuyMsg(`✓ Bought FriendPass for ${result.runner_username}! Paid ${result.price_eth} ETH (${result.price_fiat})`);
      // Refresh price
      const price = await api.getFriendPassPrice(selectedRunner.id);
      setPriceInfo(price);
    } catch (e: any) {
      const detail = e.message || '';
      if (detail.includes('supply_exhausted')) setBuyMsg('❌ All passes sold out');
      else if (detail.includes('anti_whale')) setBuyMsg('❌ You already hold the maximum 5 passes for this runner');
      else if (detail.includes('Cannot buy your own')) setBuyMsg('❌ Cannot buy your own FriendPass');
      else setBuyMsg(`❌ ${detail}`);
    }
    setBuying(false);
  };

  // ── Holdings ───────────────────────────────────────────────────────────────

  const loadHoldings = useCallback(async () => {
    if (!isConnected) return;
    setHoldingsLoading(true);
    try {
      const data = await api.getMyFriendPassHoldings();
      setHoldings(data);
    } catch { setHoldings([]); }
    setHoldingsLoading(false);
  }, [isConnected]);

  const handleSell = async (holdingId: string) => {
    setSellingId(holdingId);
    try {
      const result = await api.sellFriendPass(holdingId);
      await loadHoldings();
      alert(`Sold for ${result.sale_price_eth} ETH (${result.sale_price_fiat})`);
    } catch (e: any) {
      alert(e.message || 'Sell failed');
    }
    setSellingId(null);
  };

  useEffect(() => { if (tab === 'holdings') loadHoldings(); }, [tab, loadHoldings]);

  // ── My Holders ─────────────────────────────────────────────────────────────

  const loadMyHolders = useCallback(async () => {
    if (!isConnected || !userId) return;
    setMyHoldersLoading(true);
    try {
      const data = await api.getFriendPassHolders(userId);
      setMyHolders(data);
    } catch { setMyHolders([]); }
    setMyHoldersLoading(false);
  }, [isConnected, userId]);

  useEffect(() => { if (tab === 'my-holders') loadMyHolders(); }, [tab, loadMyHolders, userId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const bg = `${theme.bg} ${theme.text}`;
  const card = `${theme.bgCard} ${theme.border}`;
  const muted = theme.textMuted;
  const input = `${theme.inputBg} ${theme.inputBorder} ${theme.inputText} ${theme.inputPlaceholder}`;
  const tabActive = 'border-b-2 border-purple-500 text-purple-600 font-semibold';
  const tabInactive = `border-b-2 border-transparent ${muted} hover:text-gray-600`;

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${theme.border}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤝</span>
          <div>
            <h1 className="text-lg font-bold">Friend-Fi</h1>
            <p className={`text-xs ${muted}`}>Buy FriendPasses — back runners, earn early access</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-6 mt-3">
          {(['browse', 'holdings', 'my-holders'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-1 text-sm capitalize ${tab === t ? tabActive : tabInactive}`}>
              {t === 'browse' ? 'Browse Runners' : t === 'holdings' ? 'My Holdings' : 'My Holders'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Browse Tab ──────────────────────────────────────────────────── */}
        {tab === 'browse' && (
          <>
            {/* Runner list */}
            <div className={`w-64 border-r ${theme.border} flex flex-col overflow-hidden`}>
              <form onSubmit={handleSearch} className="p-3 border-b border-inherit">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search runners…"
                  className={`w-full border rounded px-3 py-1.5 text-sm ${input}`} />
              </form>
              <div className="flex-1 overflow-y-auto">
                {runnersLoading ? (
                  <div className={`p-4 text-sm text-center ${muted}`}>Loading…</div>
                ) : runners.length === 0 ? (
                  <div className={`p-4 text-sm text-center ${muted}`}>No runners found</div>
                ) : runners.map(r => (
                  <button key={r.id} onClick={() => selectRunner(r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 text-left transition-colors ${selectedRunner?.id === r.id ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}>
                    <Avatar url={r.avatar_url} username={r.username} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.username || 'Anonymous'}</p>
                      <p className={`text-xs ${muted}`}>Rep {r.reputation_score?.toFixed(0) ?? '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Runner detail / buy panel */}
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedRunner ? (
                <div className={`flex items-center justify-center h-full text-sm ${muted}`}>
                  Select a runner to see their FriendPass
                </div>
              ) : priceLoading ? (
                <div className={`flex items-center justify-center h-full text-sm ${muted}`}>Loading…</div>
              ) : (
                <div className="max-w-md space-y-5">
                  {/* Runner header */}
                  <div className="flex items-center gap-4">
                    <Avatar url={selectedRunner.avatar_url} username={selectedRunner.username} size={56} />
                    <div>
                      <h2 className="text-xl font-bold">{selectedRunner.username || 'Anonymous'}</h2>
                      <p className={`text-sm ${muted}`}>Reputation {selectedRunner.reputation_score?.toFixed(0) ?? '—'}</p>
                    </div>
                  </div>

                  {/* Price card */}
                  {priceInfo && (
                    <div className={`border rounded-xl p-5 space-y-4 ${card}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className={`text-xs uppercase tracking-wide ${muted}`}>Current Price</p>
                          <p className="text-2xl font-bold text-purple-600">{priceInfo.currentPriceFiat}</p>
                          <p className={`text-xs font-mono ${muted}`}>{priceInfo.currentPrice} ETH</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs uppercase tracking-wide ${muted}`}>Next Price</p>
                          <p className="text-sm font-semibold">{priceInfo.nextPrice} ETH</p>
                        </div>
                      </div>

                      {/* Supply bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={muted}>Supply</span>
                          <span className="font-mono">{priceInfo.currentSupply} / {priceInfo.maxSupply}</span>
                        </div>
                        <RarityBar current={priceInfo.currentSupply} max={priceInfo.maxSupply} />
                      </div>

                      {/* Benefits */}
                      <div>
                        <p className={`text-xs uppercase tracking-wide ${muted} mb-2`}>Pass Benefits</p>
                        <ul className="space-y-1">
                          {priceInfo.benefits.map((b, i) => (
                            <li key={i} className="text-xs flex gap-2">
                              <span className="text-purple-500">✓</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Buy button */}
                      {isConnected ? (
                        <button onClick={handleBuy} disabled={buying || priceInfo.currentSupply >= priceInfo.maxSupply}
                          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                          {buying ? 'Buying…' : `Buy FriendPass · ${priceInfo.currentPriceFiat}`}
                        </button>
                      ) : (
                        <p className={`text-xs text-center ${muted}`}>Connect wallet to buy</p>
                      )}

                      {buyMsg && (
                        <p className={`text-sm ${buyMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                          {buyMsg}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Holders list */}
                  {holders.length > 0 && (
                    <div className={`border rounded-xl p-4 ${card}`}>
                      <p className={`text-xs uppercase tracking-wide ${muted} mb-3`}>
                        Current Holders ({holders.length})
                      </p>
                      <div className="space-y-2">
                        {holders.map(h => (
                          <div key={h.owner_id} className="flex items-center gap-2">
                            <Avatar url={h.avatar_url} username={h.username} size={24} />
                            <span className="text-sm flex-1 truncate">{h.username || 'Anonymous'}</span>
                            <span className={`text-xs ${muted}`}>{h.passes} pass{h.passes > 1 ? 'es' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Holdings Tab ────────────────────────────────────────────────── */}
        {tab === 'holdings' && (
          <div className="flex-1 overflow-y-auto p-6">
            {!isConnected ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Connect wallet to see your holdings</div>
            ) : holdingsLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : holdings.length === 0 ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>No FriendPasses held yet</div>
            ) : (
              <div className="max-w-2xl space-y-3">
                <p className={`text-xs uppercase tracking-wide ${muted} mb-2`}>{holdings.length} active pass{holdings.length !== 1 ? 'es' : ''}</p>
                {holdings.map(h => (
                  <div key={h.holding_id} className={`border rounded-xl p-4 flex items-center gap-4 ${card}`}>
                    <Avatar url={h.runner_avatar} username={h.runner_username} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{h.runner_username || 'Unknown runner'}</p>
                      <p className={`text-xs ${muted}`}>
                        Bought {new Date(h.purchased_at).toLocaleDateString()} · {h.passes} pass · {h.purchase_price_eth} ETH
                      </p>
                    </div>
                    <button onClick={() => handleSell(h.holding_id)} disabled={sellingId === h.holding_id}
                      className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 flex-shrink-0">
                      {sellingId === h.holding_id ? 'Selling…' : 'Sell (85%)'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My Holders Tab ──────────────────────────────────────────────── */}
        {tab === 'my-holders' && (
          <div className="flex-1 overflow-y-auto p-6">
            {!isConnected ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Connect wallet to see your pass holders</div>
            ) : myHoldersLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : myHolders.length === 0 ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>
                No one holds your FriendPass yet.
                <p className={`text-xs mt-1 ${muted}`}>Share your profile to attract supporters.</p>
              </div>
            ) : (
              <div className="max-w-2xl space-y-3">
                <p className={`text-xs uppercase tracking-wide ${muted} mb-2`}>{myHolders.length} holder{myHolders.length !== 1 ? 's' : ''}</p>
                {myHolders.map(h => (
                  <div key={h.owner_id} className={`border rounded-xl p-4 flex items-center gap-3 ${card}`}>
                    <Avatar url={h.avatar_url} username={h.username} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{h.username || 'Anonymous'}</p>
                      <p className={`text-xs ${muted}`}>Joined {new Date(h.purchased_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs font-mono text-purple-600">{h.passes} pass{h.passes > 1 ? 'es' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
