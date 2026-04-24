import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl, { Popup, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Poi = {
  id: string;
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  rarity: string;
  distance_km?: number | null;
};

type RunnerEntry = {
  runnerId: string;
  username: string;
  avatar_url?: string | null;
  totalAura: string;
  auraLevel: string;
  ancientSupporterCount: number;
};

type TrendingNode = {
  username: string;
  avatar_url?: string | null;
  reputation_score?: number;
  follower_count?: number;
  momentum?: number;
};

const DEFAULT_COORDS = { lat: 59.33, lon: 18.07 };
const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const RARITY_BADGE_COLORS: Record<string, string> = {
  legendary: 'bg-yellow-500', epic: 'bg-purple-500', rare: 'bg-blue-500', common: 'bg-gray-400',
};

const RARITY_MARKER_COLORS: Record<string, string> = {
  legendary: '#d97706', epic: '#7c3aed', rare: '#2563eb', common: '#4b5563',
};

const RARITY_CARD_STYLES: Record<string, { border: string; bg: string; glow: string; text: string }> = {
  legendary: { border: 'border-yellow-300', bg: 'bg-gradient-to-br from-yellow-50 to-amber-50', glow: 'shadow-yellow-200/40', text: 'text-yellow-700' },
  epic: { border: 'border-purple-300', bg: 'bg-gradient-to-br from-purple-50 to-fuchsia-50', glow: 'shadow-purple-200/40', text: 'text-purple-700' },
  rare: { border: 'border-blue-300', bg: 'bg-gradient-to-br from-blue-50 to-sky-50', glow: 'shadow-blue-200/40', text: 'text-blue-700' },
  common: { border: 'border-gray-200', bg: 'bg-white', glow: 'shadow-gray-100/40', text: 'text-gray-500' },
};

const LEVEL_COLORS: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Rising: 'bg-blue-100 text-blue-600',
  Strong: 'bg-purple-100 text-purple-600',
  Dominant: 'bg-amber-100 text-amber-600',
};

const OSM_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function poiPopupHtml(poi: Poi): string {
  const distance = typeof poi.distance_km === 'number'
    ? `${poi.distance_km.toFixed(2)} km away`
    : `${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}`;
  const description = escapeHtml(poi.description?.trim() || 'No description yet.');
  const name = escapeHtml(poi.name);
  const rarity = escapeHtml(poi.rarity);

  return `
    <div style="min-width: 200px; color: #0f172a; font-family: utile-narrow, system-ui, sans-serif;">
      <div style="display: inline-flex; margin-bottom: 8px; border-radius: 999px; background: #ecfdf5; padding: 4px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #047857;">
        ${rarity}
      </div>
      <div style="font-size: 16px; font-weight: 800;">${name}</div>
      <div style="margin-top: 6px; font-size: 12px; color: #64748b;">${distance}</div>
      <div style="margin-top: 8px; font-size: 13px; line-height: 1.45; color: #334155;">${description}</div>
    </div>
  `;
}

function createPoiMarker(poi: Poi): HTMLDivElement {
  const marker = document.createElement('div');
  marker.style.width = '18px';
  marker.style.height = '18px';
  marker.style.borderRadius = '999px';
  marker.style.background = RARITY_MARKER_COLORS[poi.rarity] || RARITY_MARKER_COLORS.common;
  marker.style.border = '3px solid rgba(255,255,255,0.92)';
  marker.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.32)';
  marker.style.cursor = 'pointer';
  return marker;
}

async function canUseOpenFreeMap(): Promise<boolean> {
  try {
    const response = await fetch(OPEN_FREE_MAP_STYLE, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

/* ─── Rarity icon for POI cards ─── */
function RarityIcon({ rarity }: { rarity: string }) {
  if (rarity === 'legendary') return <span className="text-lg">🏆</span>;
  if (rarity === 'epic') return <span className="text-lg">💎</span>;
  if (rarity === 'rare') return <span className="text-lg">⭐</span>;
  return <span className="text-lg">📍</span>;
}

export default function Explore() {
  const { isConnected } = useAuth();
  const navigate = useNavigate();
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [mintName, setMintName] = useState('');
  const [minting, setMinting] = useState(false);
  const [message, setMessage] = useState('');
  const [mapSource, setMapSource] = useState<'openfreemap' | 'openstreetmap'>('openfreemap');
  const [mapStatus, setMapStatus] = useState('');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fallbackAppliedRef = useRef(false);

  // New state for extra sections
  const [topRunners, setTopRunners] = useState<RunnerEntry[]>([]);
  const [trending, setTrending] = useState<TrendingNode[]>([]);
  const [runnersLoading, setRunnersLoading] = useState(true);
  const [trendingLoading, setTrendingLoading] = useState(true);

  // Fetch top runners + trending on mount
  useEffect(() => {
    api.getRunnerLeaderboard()
      .then((d: any) => setTopRunners((d?.runners ?? d ?? []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setRunnersLoading(false));

    api.getGraphTrending()
      .then((d: any) => setTrending((d?.nodes ?? d ?? []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setCoords(DEFAULT_COORDS),
      );
      return;
    }
    setCoords(DEFAULT_COORDS);
  }, []);

  useEffect(() => {
    if (coords) void loadPois(coords);
  }, [coords]);

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      if (!coords || !mapContainerRef.current || mapRef.current) return;

      const openFreeMapAvailable = await canUseOpenFreeMap();
      if (disposed || !mapContainerRef.current) return;

      fallbackAppliedRef.current = !openFreeMapAvailable;
      setMapSource(openFreeMapAvailable ? 'openfreemap' : 'openstreetmap');
      setMapStatus(openFreeMapAvailable ? '' : 'OpenFreeMap is unavailable right now, so the map is using OpenStreetMap tiles.');

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: openFreeMapAvailable ? OPEN_FREE_MAP_STYLE : OSM_FALLBACK_STYLE,
        center: [coords.lon, coords.lat],
        zoom: 13,
      });

      const applyFallback = () => {
        if (fallbackAppliedRef.current) return;
        fallbackAppliedRef.current = true;
        setMapSource('openstreetmap');
        setMapStatus('OpenFreeMap failed to load, so the map fell back to OpenStreetMap tiles.');
        map.setStyle(OSM_FALLBACK_STYLE);
      };

      map.on('error', (event) => {
        if (fallbackAppliedRef.current) return;
        const details = `${event.error?.message || ''} ${JSON.stringify(event)}`.toLowerCase();
        if (details.includes('openfreemap') || details.includes('tiles.openfreemap.org')) {
          applyFallback();
        }
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
      mapRef.current = map;
    }

    void initializeMap();
    return () => { disposed = true; };
  }, [coords]);

  useEffect(() => {
    if (!coords || !mapRef.current) return;
    const map = mapRef.current;
    map.easeTo({ center: [coords.lon, coords.lat], duration: 800 });

    if (!userMarkerRef.current) {
      const markerNode = document.createElement('div');
      markerNode.style.width = '16px';
      markerNode.style.height = '16px';
      markerNode.style.borderRadius = '999px';
      markerNode.style.background = '#10b981';
      markerNode.style.border = '4px solid rgba(255,255,255,0.95)';
      markerNode.style.boxShadow = '0 0 0 8px rgba(16,185,129,0.18)';
      userMarkerRef.current = new maplibregl.Marker({ element: markerNode })
        .setLngLat([coords.lon, coords.lat])
        .addTo(map);
      return;
    }
    userMarkerRef.current.setLngLat([coords.lon, coords.lat]);
  }, [coords]);

  useEffect(() => {
    if (!mapRef.current) return;
    poiMarkersRef.current.forEach((marker) => marker.remove());
    poiMarkersRef.current = pois.map((poi) => {
      const popup = new Popup({ offset: 18 }).setHTML(poiPopupHtml(poi));
      return new maplibregl.Marker({ element: createPoiMarker(poi) })
        .setLngLat([poi.longitude, poi.latitude])
        .setPopup(popup)
        .addTo(mapRef.current!);
    });
  }, [pois]);

  useEffect(() => {
    return () => {
      poiMarkersRef.current.forEach((marker) => marker.remove());
      userMarkerRef.current?.remove();
      mapRef.current?.remove();
      poiMarkersRef.current = [];
      userMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  const loadPois = async (targetCoords: { lat: number; lon: number }) => {
    setLoading(true);
    try {
      const data = await api.getNearbyPois(targetCoords.lat, targetCoords.lon, 10);
      setPois(data);
    } catch (err: any) {
      setMessage(err.message);
    }
    setLoading(false);
  };

  const handleMint = async () => {
    if (!coords || !mintName) return;
    setMinting(true);
    setMessage('');
    try {
      const poi = await api.mintPoi(mintName, coords.lat, coords.lon);
      setMessage(`Minted "${poi.name}" (${poi.rarity}) successfully!`);
      setMintName('');
      await loadPois(coords);
    } catch (err: any) {
      setMessage(err.message);
    }
    setMinting(false);
  };

  // Separate POIs by rarity for the featured section
  const featuredPois = pois.filter((p) => p.rarity === 'legendary' || p.rarity === 'epic');
  const recentPois = pois.slice(0, 6);

  return (
    <div className="space-y-8">

      {/* ─── Epic Hero Banner with map inside ─── */}
      <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
        {/* Background image */}
        <img
          src="/explore-banner.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
        />
        {/* Dark gradient overlay — bottom-heavy so map stays crisp */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,40,0.52)_0%,rgba(10,20,40,0.38)_30%,rgba(10,20,40,0.72)_100%)]" />
        {/* Subtle vignette sides */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(5,10,20,0.45)_100%)]" />

        <div className="relative z-10 px-6 pt-8 pb-6 lg:px-8">
          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-sm mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live trail explorer
              </span>
              <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg sm:text-5xl">Explore</h1>
              <p className="mt-1.5 text-sm text-white/70">Discover POIs, top runners, and trending activity on the trail.</p>
            </div>

            {/* Quick stats — right side of title */}
            {coords && (
              <div className="flex flex-wrap gap-2 sm:gap-3 shrink-0">
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-md text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">POIs</p>
                  <p className="text-xl font-bold text-white mt-0.5">{pois.length}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-md text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-300">Rare+</p>
                  <p className="text-xl font-bold text-white mt-0.5">{pois.filter(p => p.rarity !== 'common').length}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-md text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Runners</p>
                  <p className="text-xl font-bold text-white mt-0.5">{topRunners.length}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-md text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-300">Trending</p>
                  <p className="text-xl font-bold text-white mt-0.5">{trending.length}</p>
                </div>
              </div>
            )}
          </div>

          {/* Map card — elevated glass panel so it floats above the hero */}
          <div className="overflow-hidden rounded-2xl border border-white/20 shadow-[0_8px_40px_rgba(0,0,0,0.4)] backdrop-blur-sm">
            {/* Map toolbar */}
            <div className="flex flex-col gap-2 border-b border-white/10 bg-black/30 px-5 py-3 md:flex-row md:items-center md:justify-between backdrop-blur-md">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400">Hexa map explorer</p>
                <h3 className="text-sm font-bold text-white">Nearby POIs on live tiles</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/60">
                <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1">
                  {mapSource === 'openfreemap' ? 'OpenFreeMap' : 'OpenStreetMap'}
                </span>
                <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1">
                  {pois.length} POIs in 10 km
                </span>
              </div>
            </div>

            <div ref={mapContainerRef} className="h-[420px] w-full bg-slate-900" />

            {mapStatus && (
              <div className="bg-black/30 backdrop-blur-md px-5 py-2.5">
                <p className="text-xs font-semibold text-amber-400">{mapStatus}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Mint POI ─── */}
      {isConnected && (
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">Mint a POI at your location</h3>
          <div className="flex gap-2">
            <input
              type="text" value={mintName} onChange={(e) => setMintName(e.target.value)}
              placeholder="POI name (3-100 chars)" minLength={3} maxLength={100}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300"
            />
            <button onClick={handleMint} disabled={minting || mintName.length < 3}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
              {minting ? 'Minting...' : 'Mint POI'}
            </button>
          </div>
          {message && <p className="text-sm mt-2 text-emerald-700">{message}</p>}
        </div>
      )}

      {/* ─── Featured POIs (Legendary + Epic) ─── */}
      {featuredPois.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Featured Discoveries</h2>
              <p className="text-sm text-gray-500">Legendary and Epic POIs near you</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
              {featuredPois.length} found
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featuredPois.map((poi) => {
              const style = RARITY_CARD_STYLES[poi.rarity] || RARITY_CARD_STYLES.common;
              return (
                <div key={poi.id} className={`rounded-2xl border ${style.border} ${style.bg} p-5 shadow-md ${style.glow} transition-all hover:scale-[1.01]`}>
                  <div className="flex items-center gap-3 mb-3">
                    <RarityIcon rarity={poi.rarity} />
                    <span className={`text-xs font-bold uppercase tracking-widest ${style.text}`}>{poi.rarity}</span>
                  </div>
                  <h4 className="text-lg font-bold text-gray-900">{poi.name}</h4>
                  {poi.description && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{poi.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    {poi.distance_km ? `${poi.distance_km.toFixed(1)} km away` : `${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Recently Minted POIs ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Minted POIs</h2>
            <p className="text-sm text-gray-500">Recently discovered points of interest</p>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentPois.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center">
            <p className="text-gray-400 text-sm">No POIs found nearby. Be the first to mint one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentPois.map((poi) => {
              const style = RARITY_CARD_STYLES[poi.rarity] || RARITY_CARD_STYLES.common;
              return (
                <div key={poi.id} className={`rounded-2xl border ${style.border} ${style.bg} p-4 shadow-sm hover:shadow-md transition-all`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${RARITY_BADGE_COLORS[poi.rarity] || 'bg-gray-300'}`} />
                    <span className={`text-xs uppercase font-semibold tracking-wide ${style.text}`}>{poi.rarity}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900">{poi.name}</h4>
                  {poi.description && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{poi.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    {poi.distance_km ? `${poi.distance_km.toFixed(1)} km away` : `${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Two-column: Top Runners + Trending ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Runners */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-50 via-white to-green-50 px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Top Runners</h2>
                <p className="text-xs text-gray-500">Highest aura on the trail</p>
              </div>
              <button
                onClick={() => navigate('/leaderboard')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                View all →
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {runnersLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : topRunners.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">No runners yet. Be the first.</p>
            ) : (
              topRunners.map((r, i) => (
                <button
                  key={r.runnerId}
                  onClick={() => r.username && navigate(`/profile?runner=${r.username}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-emerald-50/40 transition-colors text-left"
                >
                  <span className="w-6 text-sm font-bold text-gray-300 tabular-nums">{i + 1}</span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden relative">
                    {r.username?.[0]?.toUpperCase() || '?'}
                    {r.avatar_url && <img src={r.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => e.currentTarget.remove()} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.username || 'Anonymous'}</p>
                    <p className="text-xs text-gray-500">
                      Aura {parseFloat(r.totalAura).toFixed(1)} · {r.ancientSupporterCount} supporter{r.ancientSupporterCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_COLORS[r.auraLevel] || 'bg-gray-100 text-gray-500'}`}>
                    {r.auraLevel}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Trending */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-sky-50 via-white to-purple-50 px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Trending</h2>
                <p className="text-xs text-gray-500">Rising momentum on the network</p>
              </div>
              <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-3 py-1 rounded-full">🔥 Hot</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {trendingLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : trending.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">No trending activity yet.</p>
            ) : (
              trending.map((t) => (
                <button
                  key={t.username}
                  onClick={() => t.username && navigate(`/profile?runner=${t.username}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-sky-50/40 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden relative">
                    {t.username?.[0]?.toUpperCase() || '?'}
                    {t.avatar_url && <img src={t.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => e.currentTarget.remove()} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.username}</p>
                    <p className="text-xs text-gray-500">
                      {t.reputation_score != null ? `Rep ${t.reputation_score.toFixed(1)}` : ''}
                      {t.follower_count != null ? ` · ${t.follower_count} followers` : ''}
                    </p>
                  </div>
                  {t.momentum != null && (
                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      +{t.momentum.toFixed(0)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
