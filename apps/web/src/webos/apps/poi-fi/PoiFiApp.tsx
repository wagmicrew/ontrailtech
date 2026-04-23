import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../core/theme-store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface POIWithStats {
  poi_id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  rarity: string;
  checkin_count: number;
  pending_rewards_eth: string;
  pending_rewards_fiat: string;
  listed_for_sale: boolean;
  listing_price_eth: string | null;
  listing_id: string | null;
}

interface RewardSummary {
  total_pending_eth: string;
  total_pending_fiat: string;
  total_claimed_eth: string;
  unclaimed_count: number;
  poi_count: number;
}

interface Listing {
  listing_id: string;
  poi_id: string;
  poi_name: string;
  poi_rarity: string;
  poi_latitude: number;
  poi_longitude: number;
  seller_id: string;
  seller_username: string | null;
  price_eth: string;
  price_fiat: string;
  created_at: string;
}

type Tab = 'my-pois' | 'marketplace' | 'rewards';

// ── Rarity colours ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  legendary: 'text-yellow-500 bg-yellow-50 border-yellow-200',
  epic: 'text-purple-600 bg-purple-50 border-purple-200',
  rare: 'text-blue-600 bg-blue-50 border-blue-200',
  common: 'text-gray-600 bg-gray-100 border-gray-200',
};

function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${RARITY_COLORS[rarity] ?? RARITY_COLORS.common}`}>
      {rarity}
    </span>
  );
}

function CoordLabel({ lat, lon }: { lat: number; lon: number }) {
  return <span className="text-xs font-mono">{lat.toFixed(4)}, {lon.toFixed(4)}</span>;
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function PoiFiApp() {
  const { isConnected } = useAuth();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('my-pois');

  // My POIs
  const [pois, setPois] = useState<POIWithStats[]>([]);
  const [poisLoading, setPoisLoading] = useState(false);
  const [listingPoi, setListingPoi] = useState<string | null>(null);
  const [listingPrice, setListingPrice] = useState('');
  const [listingMsg, setListingMsg] = useState('');

  // Rewards
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');

  // Marketplace
  const [listings, setListings] = useState<Listing[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [marketMsg, setMarketMsg] = useState('');

  // ── Theming ────────────────────────────────────────────────────────────────

  const bg = `${theme.bg} ${theme.text}`;
  const card = `${theme.bgCard} ${theme.border}`;
  const muted = theme.textMuted;
  const inp = `${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`;
  const tabActive = 'border-b-2 border-green-500 text-green-600 font-semibold';
  const tabInactive = `border-b-2 border-transparent ${muted} hover:text-gray-600`;

  // ── Load My POIs ──────────────────────────────────────────────────────────

  const loadPois = useCallback(async () => {
    if (!isConnected) return;
    setPoisLoading(true);
    try {
      const data = await api.getMyPois();
      setPois(data);
    } catch { setPois([]); }
    setPoisLoading(false);
  }, [isConnected]);

  useEffect(() => { if (tab === 'my-pois') loadPois(); }, [tab, loadPois]);

  // ── Load Reward Summary ───────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    if (!isConnected) return;
    setSummaryLoading(true);
    try {
      const data = await api.getPoiRewardSummary();
      setSummary(data);
    } catch { setSummary(null); }
    setSummaryLoading(false);
  }, [isConnected]);

  useEffect(() => { if (tab === 'rewards') loadSummary(); }, [tab, loadSummary]);

  // ── Load Marketplace ──────────────────────────────────────────────────────

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const data = await api.getPoiMarketplace();
      setListings(data);
    } catch { setListings([]); }
    setMarketLoading(false);
  }, []);

  useEffect(() => { if (tab === 'marketplace') loadMarket(); }, [tab, loadMarket]);

  // ── List POI for sale ─────────────────────────────────────────────────────

  const handleList = async (poiId: string) => {
    const price = parseFloat(listingPrice);
    if (!price || price <= 0) { setListingMsg('Enter a valid price'); return; }
    setListingMsg('');
    try {
      await api.createPoiListing(poiId, price);
      setListingPoi(null);
      setListingPrice('');
      await loadPois();
      setListingMsg('✓ Listed');
    } catch (e: any) {
      setListingMsg(e.message || 'Failed to list');
    }
  };

  const handleDelistPoi = async (listingId: string) => {
    try {
      await api.cancelPoiListing(listingId);
      await loadPois();
    } catch (e: any) { alert(e.message || 'Failed to cancel'); }
  };

  // ── Claim rewards ─────────────────────────────────────────────────────────

  const handleClaim = async () => {
    setClaiming(true);
    setClaimMsg('');
    try {
      const result = await api.claimPoiRewards();
      setClaimMsg(`✓ Claimed ${result.claimed_count} rewards — ${result.total_eth} ETH (${result.total_fiat})`);
      await loadSummary();
    } catch (e: any) {
      setClaimMsg(e.message?.includes('No unclaimed') ? 'No unclaimed rewards' : (e.message || 'Claim failed'));
    }
    setClaiming(false);
  };

  // ── Buy from marketplace ──────────────────────────────────────────────────

  const handleBuy = async (listingId: string) => {
    setBuyingId(listingId);
    setMarketMsg('');
    try {
      const result = await api.buyPoiListing(listingId);
      setMarketMsg(`✓ Purchased POI! ${result.price_eth} ETH paid.`);
      await loadMarket();
    } catch (e: any) {
      setMarketMsg(e.message || 'Purchase failed');
    }
    setBuyingId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${theme.border}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div>
            <h1 className="text-lg font-bold">POI-Fi</h1>
            <p className={`text-xs ${muted}`}>Earn passive income from your POIs — check-in rewards & marketplace</p>
          </div>
        </div>
        <div className="flex gap-6 mt-3">
          {(['my-pois', 'rewards', 'marketplace'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-1 text-sm ${tab === t ? tabActive : tabInactive}`}>
              {t === 'my-pois' ? 'My POIs' : t === 'rewards' ? 'Rewards' : 'Marketplace'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── My POIs ──────────────────────────────────────────────────────── */}
        {tab === 'my-pois' && (
          <>
            {!isConnected ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Connect wallet to view your POIs</div>
            ) : poisLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : pois.length === 0 ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>
                No POIs minted yet.
                <p className={`text-xs mt-1 ${muted}`}>Mint POIs on the Trail Lab map to start earning.</p>
              </div>
            ) : (
              <div className="max-w-3xl space-y-3">
                {listingMsg && (
                  <p className={`text-sm ${listingMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                    {listingMsg}
                  </p>
                )}
                {pois.map(p => (
                  <div key={p.poi_id} className={`border rounded-xl p-4 ${card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{p.name}</span>
                          <RarityBadge rarity={p.rarity} />
                          {p.listed_for_sale && (
                            <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-2 py-0.5 rounded">
                              Listed {p.listing_price_eth} ETH
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${muted} mb-2`}>
                          <CoordLabel lat={p.latitude} lon={p.longitude} />
                          {p.description && ` · ${p.description}`}
                        </p>
                        <div className="flex gap-4 text-xs">
                          <span><span className={muted}>Check-ins:</span> <strong>{p.checkin_count}</strong></span>
                          <span><span className={muted}>Pending:</span> <strong className="text-green-600">{p.pending_rewards_fiat}</strong></span>
                          <span className={`font-mono ${muted}`}>{p.pending_rewards_eth} ETH</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {p.listed_for_sale ? (
                          <button onClick={() => p.listing_id && handleDelistPoi(p.listing_id)}
                            className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                            Delist
                          </button>
                        ) : (
                          <>
                            {listingPoi === p.poi_id ? (
                              <div className="flex gap-1">
                                <input value={listingPrice} onChange={e => setListingPrice(e.target.value)}
                                  placeholder="ETH" type="number" min="0.0001" step="0.0001"
                                  className={`border rounded px-2 py-1 text-xs w-20 ${inp}`} />
                                <button onClick={() => handleList(p.poi_id)}
                                  className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg">List</button>
                                <button onClick={() => setListingPoi(null)}
                                  className={`text-xs px-2 py-1 rounded-lg ${muted}`}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setListingPoi(p.poi_id); setListingPrice(''); }}
                                className="text-xs border border-green-300 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-50">
                                Sell
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Rewards ───────────────────────────────────────────────────────── */}
        {tab === 'rewards' && (
          <>
            {!isConnected ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Connect wallet to see rewards</div>
            ) : summaryLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : (
              <div className="max-w-md space-y-5">
                {summary && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Pending Rewards', value: summary.total_pending_fiat, sub: `${summary.total_pending_eth} ETH`, color: 'text-green-600' },
                        { label: 'Total Claimed', value: `${summary.total_claimed_eth} ETH`, sub: 'lifetime', color: 'text-blue-600' },
                        { label: 'Unclaimed Events', value: String(summary.unclaimed_count), sub: 'check-ins', color: 'text-orange-500' },
                        { label: 'Your POIs', value: String(summary.poi_count), sub: 'minted', color: 'text-purple-600' },
                      ].map(stat => (
                        <div key={stat.label} className={`border rounded-xl p-4 ${card}`}>
                          <p className={`text-xs uppercase tracking-wide ${muted} mb-1`}>{stat.label}</p>
                          <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                          <p className={`text-xs ${muted}`}>{stat.sub}</p>
                        </div>
                      ))}
                    </div>

                    <div className={`border rounded-xl p-5 ${card}`}>
                      <p className={`text-sm ${muted} mb-3`}>
                        Earn <strong>0.0001 ETH</strong> each time another runner checks in at your POI.
                        Rewards accumulate off-chain and can be claimed any time.
                      </p>
                      <button onClick={handleClaim} disabled={claiming || summary.unclaimed_count === 0}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                        {claiming ? 'Claiming…' : `Claim ${summary.unclaimed_count} Reward${summary.unclaimed_count !== 1 ? 's' : ''}`}
                      </button>
                      {claimMsg && (
                        <p className={`text-sm mt-2 ${claimMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                          {claimMsg}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Marketplace ───────────────────────────────────────────────────── */}
        {tab === 'marketplace' && (
          <>
            {marketLoading ? (
              <div className={`text-sm text-center mt-20 ${muted}`}>Loading…</div>
            ) : (
              <div className="max-w-3xl space-y-3">
                {marketMsg && (
                  <p className={`text-sm ${marketMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                    {marketMsg}
                  </p>
                )}
                {listings.length === 0 ? (
                  <div className={`text-sm text-center mt-20 ${muted}`}>
                    No POIs listed for sale right now.
                    <p className={`text-xs mt-1 ${muted}`}>List your own POIs from the My POIs tab.</p>
                  </div>
                ) : listings.map(l => (
                  <div key={l.listing_id} className={`border rounded-xl p-4 flex items-center gap-4 ${card}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{l.poi_name}</span>
                        <RarityBadge rarity={l.poi_rarity} />
                      </div>
                      <p className={`text-xs ${muted} mb-1`}>
                        <CoordLabel lat={l.poi_latitude} lon={l.poi_longitude} />
                        {l.seller_username && ` · by ${l.seller_username}`}
                      </p>
                      <p className="text-xs text-green-600 font-semibold">{l.price_fiat}</p>
                      <p className={`text-xs font-mono ${muted}`}>{l.price_eth} ETH</p>
                    </div>
                    {isConnected ? (
                      <button onClick={() => handleBuy(l.listing_id)} disabled={buyingId === l.listing_id}
                        className="text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex-shrink-0">
                        {buyingId === l.listing_id ? 'Buying…' : 'Buy'}
                      </button>
                    ) : (
                      <span className={`text-xs ${muted}`}>Connect wallet</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
