/**
 * TrailLabPage — Admin full trail editor
 * • Collapsible sidebar drawer with trail list
 * • Bento grid gallery (spotlight + mini cards)
 * • Drag-and-drop POI reorder
 * • localStorage load / save / JSON export / import
 */
import {
  useEffect, useMemo, useRef, useState,
  type ChangeEvent, type DragEvent,
} from 'react';
import { api } from '../../lib/api';
import TrailMapEditor from '../../components/TrailMapEditor';
import {
  SUPPORTED_IMPORT_FORMATS,
  calculateTrailDistanceKm,
  canDeleteTrail,
  createDetourPoi,
  createStarterTrail,
  createTrailId,
  defaultRewardPoints,
  insertTrailPoint,
  metersFromTrail,
  moveTrailPoint,
  parseTrailImportFile,
  projectDetourPoi,
  syncPoiConnections,
  type TrailDraft,
  type TrailPoi,
} from '../../lib/trailStudio';

/* ─────────────── constants ─────────────── */
const STORAGE_KEY = 'ontrail_admin_trail_lab_v1';
const DIFFICULTIES: TrailDraft['difficulty'][] = ['easy', 'moderate', 'hard', 'expert'];
const IMPORT_ACCEPT =
  '.gpx,.kml,.kmz,.csv,.json,.geojson,.xml,.tcx,.crs,.fit,.pwx,.nmea,.ovl,.itn,.sdf,.trc,.rss,.txt,.xls,.xlsx,.bin';

const KIND_COLORS: Record<string, { bg: string; text: string }> = {
  checkpoint: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  detour:     { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  scenic:     { bg: 'bg-purple-100',  text: 'text-purple-700'  },
  water:      { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  photo:      { bg: 'bg-pink-100',    text: 'text-pink-700'    },
};

/* ─────────────── types ─────────────── */
type NearbyPoi = { id: string; name: string; latitude: number; longitude: number; description?: string | null };
type GeoState  = { lat: number; lon: number; accuracy: number };

/* ─────────────── helpers ─────────────── */
function normalizeTrail(trail: TrailDraft): TrailDraft {
  return {
    ...trail,
    pois: syncPoiConnections(trail.points, trail.pois),
    distanceKm: trail.points.length > 1 ? calculateTrailDistanceKm(trail.points) : trail.distanceKm,
    updatedAt: new Date().toISOString(),
  };
}

function difficultyFromKm(km: number): TrailDraft['difficulty'] {
  if (km >= 25) return 'expert';
  if (km >= 14) return 'hard';
  if (km >= 6)  return 'moderate';
  return 'easy';
}

function mapApiRoute(route: any): TrailDraft {
  const c = Number(route.completion_count) || 0;
  return {
    id: createTrailId(),
    ownerKey: route.creator_username || 'admin',
    ownerName: route.creator_username || 'Unknown runner',
    publishedRouteId: route.id,
    name: route.name || 'Untitled trail',
    description: route.description || '',
    difficulty: DIFFICULTIES.includes(route.difficulty) ? route.difficulty : 'moderate',
    surface: 'mixed terrain',
    region: [route.start_poi_name, route.end_poi_name].filter(Boolean).join(' → ') || '',
    durationMin: 60,
    distanceKm: Number(route.distance_km) || 0,
    views: Math.max(32, c * 18),
    reputation: Math.max(24, c * 12 + (route.is_minted ? 40 : 0)),
    published: true,
    minted: Boolean(route.is_minted),
    importedFrom: 'route api',
    sourceFormat: route.build_mode === 'auto' ? 'OnTrail mobile GPS' : 'OnTrail mobile manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    points: [], pois: [], photoSubmissions: [],
  };
}

function persistTrails(trails: TrailDraft[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trails)); } catch { /* quota */ }
}

function loadPersistedTrails(): TrailDraft[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

/* ─────────────── sub-components ─────────────── */

function Pill({ color, children }: { color: 'green' | 'amber' | 'gray'; children: React.ReactNode }) {
  const cls = color === 'green' ? 'bg-emerald-100 text-emerald-700'
            : color === 'amber' ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-500';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

function StatBento({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: string }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm flex flex-col justify-between ${accent || 'border-gray-100'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-3xl font-black text-gray-900 mt-1 leading-none">{value}</p>
      {note && <p className="text-[10px] text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function BentoTrailCard({
  trail, selected, spotlight, busy,
  onEdit, onPublish, onMint, onDelete,
}: {
  trail: TrailDraft; selected: boolean; spotlight: boolean; busy: boolean;
  onEdit: () => void; onPublish: () => void; onMint: () => void; onDelete: () => void;
}) {
  const status = trail.minted ? 'minted' : trail.published ? 'published' : 'draft';
  const barCls = status === 'minted'
    ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
    : status === 'published'
    ? 'bg-gradient-to-r from-emerald-400 to-green-500'
    : 'bg-gradient-to-r from-gray-200 to-gray-300';

  return (
    <div
      onClick={onEdit}
      className={`group rounded-2xl border bg-white shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${selected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-100'} ${spotlight ? 'col-span-2 row-span-1' : ''}`}
    >
      <div className={`h-1.5 w-full ${barCls}`} />
      <div className={`p-4 ${spotlight ? 'flex gap-5 items-start' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 justify-between">
            <div className="min-w-0">
              <h3 className={`font-bold text-gray-900 truncate ${spotlight ? 'text-base' : 'text-sm'}`}>{trail.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {trail.ownerName} · {trail.distanceKm > 0 ? `${trail.distanceKm.toFixed(1)} km` : 'draft'} · {trail.difficulty}
              </p>
            </div>
            <Pill color={status === 'minted' ? 'amber' : status === 'published' ? 'green' : 'gray'}>
              {status}
            </Pill>
          </div>

          {spotlight && trail.description && (
            <p className="mt-2 text-xs text-gray-500 line-clamp-2">{trail.description}</p>
          )}

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[
              { v: trail.points.length, l: 'pts' },
              { v: trail.pois.length,   l: 'POIs' },
              { v: trail.views,         l: 'views' },
              { v: trail.reputation,    l: 'rep' },
            ].map(({ v, l }) => (
              <div key={l} className="rounded-xl bg-gray-50 py-1.5 text-center">
                <p className="text-xs font-bold text-gray-900">{v}</p>
                <p className="text-[9px] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`flex gap-1 mt-3 ${spotlight ? 'mt-0 flex-col justify-start min-w-[80px]' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onEdit}
            className="flex-1 rounded-lg bg-gray-900 text-white text-[10px] font-bold py-1.5 px-2 hover:bg-emerald-600 transition-colors">
            Edit
          </button>
          {!trail.published && (
            <button onClick={onPublish} disabled={busy}
              className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold py-1.5 px-2 hover:bg-emerald-100 transition-colors disabled:opacity-40">
              Publish
            </button>
          )}
          {!trail.minted && (
            <button onClick={onMint} disabled={busy}
              className="flex-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-bold py-1.5 px-2 hover:bg-amber-100 transition-colors disabled:opacity-40">
              Mint
            </button>
          )}
          {canDeleteTrail(trail) && (
            <button onClick={onDelete} disabled={busy}
              className="rounded-lg border border-red-100 bg-red-50 text-red-500 text-[10px] font-bold px-2 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-40">
              X
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarRow({
  trail, selected, onEdit,
}: { trail: TrailDraft; selected: boolean; onEdit: () => void }) {
  const status = trail.minted ? 'minted' : trail.published ? 'pub' : 'draft';
  const dotCls = trail.minted ? 'bg-amber-400' : trail.published ? 'bg-emerald-400' : 'bg-gray-300';
  return (
    <button
      onClick={onEdit}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${selected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50 border border-transparent'}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate">{trail.name}</p>
        <p className="text-[10px] text-gray-400 truncate">
          {trail.ownerName} · {trail.distanceKm > 0 ? `${trail.distanceKm.toFixed(1)} km` : status}
        </p>
      </div>
      {trail.pois.length > 0 && (
        <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 flex-shrink-0">{trail.pois.length}p</span>
      )}
    </button>
  );
}

function PoiRow({
  poi, selected, dragOver,
  onSelect, onRewardChange, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  poi: TrailPoi; selected: boolean; dragOver: boolean;
  onSelect: () => void;
  onRewardChange: (pts: number) => void;
  onRemove: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}) {
  const kc = KIND_COLORS[poi.kind] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-grab active:cursor-grabbing border transition-all select-none
        ${dragOver   ? 'border-emerald-400 bg-emerald-50 scale-[1.01]' : ''}
        ${selected && !dragOver ? 'border-sky-300 bg-sky-50' : ''}
        ${!selected && !dragOver ? 'border-gray-100 bg-white hover:border-gray-200' : ''}
      `}
    >
      <span className="text-gray-300 flex-shrink-0 cursor-grab" title="Drag to reorder">
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
        </svg>
      </span>
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${kc.bg} ${kc.text}`}>
        {poi.kind}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 truncate">{poi.name}</p>
        <p className="text-[9px] text-gray-400">{poi.lat.toFixed(4)}, {poi.lon.toFixed(4)}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <input
          type="number" min={0}
          value={poi.rewardPoints ?? 0}
          onChange={e => onRewardChange(Number(e.target.value))}
          className="w-12 rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-emerald-300"
        />
        <span className="text-[9px] text-gray-400">pt</span>
        <button
          onClick={onRemove}
          className="ml-1 text-gray-300 hover:text-red-500 transition-colors text-sm leading-none"
        >x</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Main component
══════════════════════════════════════════════ */
export default function TrailLabPage() {
  const [trails, setTrails]               = useState<TrailDraft[]>([]);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [loading, setLoading]             = useState(false);
  const [importing, setImporting]         = useState(false);
  const [busyTrailId, setBusyTrailId]     = useState<string | null>(null);
  const [notice, setNotice]               = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [savedFlash, setSavedFlash]       = useState(false);

  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [searchInput, setSearchInput]     = useState('');
  const [galleryOpen, setGalleryOpen]     = useState(true);

  const [mapMode, setMapMode]             = useState<'select' | 'checkpoint' | 'detour'>('select');
  const [selCpIdx, setSelCpIdx]           = useState<number | null>(null);
  const [selPoiId, setSelPoiId]           = useState<string | null>(null);
  const [dragCpIdx, setDragCpIdx]         = useState<number | null>(null);

  const [dragPoiId, setDragPoiId]         = useState<string | null>(null);
  const [dragOverPoiId, setDragOverPoiId] = useState<string | null>(null);

  const [poiForm, setPoiForm]             = useState({
    name: '', note: '', kind: 'checkpoint' as TrailPoi['kind'],
    offsetMeters: '180', rewardPoints: '10', lat: '', lon: '',
  });

  const [nearbyPois, setNearbyPois]       = useState<NearbyPoi[]>([]);
  const [geo, setGeo]                     = useState<GeoState | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<TrailDraft | null>(null);
  const [editorTab, setEditorTab]         = useState<'details' | 'checkpoints' | 'pois' | 'nearby'>('details');

  const editorRef = useRef<HTMLDivElement | null>(null);
  const importJsonRef = useRef<HTMLInputElement>(null);

  const selectedTrail = useMemo(
    () => trails.find(t => t.id === selectedTrailId) ?? null,
    [selectedTrailId, trails],
  );

  const filteredTrails = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return q ? trails.filter(t => t.name.toLowerCase().includes(q) || t.ownerName.toLowerCase().includes(q)) : trails;
  }, [trails, searchInput]);

  const totalViews      = useMemo(() => trails.reduce((s, t) => s + t.views, 0), [trails]);
  const totalReputation = useMemo(() => trails.reduce((s, t) => s + t.reputation, 0), [trails]);
  const totalPoiRewards = useMemo(
    () => selectedTrail?.pois.reduce((s, p) => s + (p.rewardPoints || 0), 0) ?? 0,
    [selectedTrail],
  );

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setGeo({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (!geo) return;
    api.getNearbyPois(geo.lat, geo.lon, 15).then(items => setNearbyPois(items || [])).catch(() => undefined);
  }, [geo]);

  useEffect(() => {
    const local = loadPersistedTrails();
    if (local.length) {
      setTrails(local);
      setSelectedTrailId(local[0].id);
    }
    loadFromApi();
  }, []);

  useEffect(() => {
    if (trails.length) persistTrails(trails);
  }, [trails]);

  function patch(trailId: string, updater: (t: TrailDraft) => TrailDraft) {
    setTrails(c => c.map(t => t.id === trailId ? normalizeTrail(updater(t)) : t));
  }

  function setNoticeTemp(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  function handleSave() {
    persistTrails(trails);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(trails, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ontrail-trails-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNoticeTemp('Trails exported as JSON.');
  }

  async function handleImportJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: TrailDraft[] = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('File must be a JSON array of trails.');
      const merged = [...parsed, ...trails.filter(t => !parsed.some((p: TrailDraft) => p.id === t.id))];
      setTrails(merged);
      if (parsed.length) setSelectedTrailId(parsed[0].id);
      setNoticeTemp(`Loaded ${parsed.length} trail(s) from JSON.`);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON file.');
    } finally {
      e.target.value = '';
    }
  }

  async function loadFromApi(runner?: string) {
    setLoading(true);
    setError(null);
    try {
      const routes = runner ? await api.getRoutesByRunner(runner) : await api.getMyRoutes();
      if (routes.length) {
        const mapped = routes.map(mapApiRoute);
        setTrails(prev => {
          const newIds = new Set(mapped.map((r: TrailDraft) => r.publishedRouteId));
          const kept = prev.filter(t => !t.publishedRouteId || !newIds.has(t.publishedRouteId));
          const merged = [...mapped, ...kept];
          persistTrails(merged);
          return merged;
        });
        setSelectedTrailId((s: string | null) => s ?? mapped[0]?.id ?? null);
      }
    } catch (err: any) {
      setError(err.message || 'API load failed — using local cache.');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateTrail() {
    const t = createStarterTrail('admin', 'Admin');
    t.id = createTrailId();
    t.name = `Admin draft ${trails.length + 1}`;
    t.views = 0; t.reputation = 0;
    setTrails(c => [t, ...c]);
    setSelectedTrailId(t.id);
    setNoticeTemp('New trail draft created.');
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setError(null);
    try {
      const parsed = await parseTrailImportFile(file);
      const base = selectedTrail ?? createStarterTrail('admin', 'Admin');
      const next = normalizeTrail({
        ...base,
        id: selectedTrail?.id ?? createTrailId(),
        name: parsed.name || base.name,
        description: base.description || `Imported from ${parsed.sourceFormat}.`,
        difficulty: difficultyFromKm(parsed.distanceKm || base.distanceKm),
        durationMin: parsed.estimatedDurationMin || base.durationMin,
        importedFrom: file.name, sourceFormat: parsed.sourceFormat,
        points: parsed.points.length ? parsed.points : base.points,
        pois: [...base.pois, ...parsed.pois],
        published: false,
      });
      setTrails(c => {
        const exists = c.some(t => t.id === next.id);
        return exists ? c.map(t => t.id === next.id ? next : t) : [next, ...c];
      });
      setSelectedTrailId(next.id);
      setNoticeTemp(`Imported ${parsed.sourceFormat} — ${parsed.points.length} pts, ${parsed.pois.length} POIs.${parsed.warnings[0] ? ' ' + parsed.warnings[0] : ''}`);
    } catch (err: any) {
      setError(err?.message || 'Import failed.');
    } finally {
      setImporting(false); e.target.value = '';
    }
  }

  function handleField<K extends keyof TrailDraft>(field: K, value: TrailDraft[K]) {
    if (!selectedTrail) return;
    patch(selectedTrail.id, t => ({ ...t, [field]: value }));
  }

  function handleMapCheckpoint(lat: number, lon: number) {
    if (!selectedTrail) return;
    const idx = selCpIdx ?? Math.max(0, selectedTrail.points.length - 1);
    patch(selectedTrail.id, t => ({
      ...t,
      points: insertTrailPoint(t.points, idx, { lat, lon, label: `CP ${idx + 2}`, timestamp: new Date().toISOString() }),
      reputation: t.reputation + 2,
    }));
    setSelCpIdx(Math.max(0, idx + 1));
    setSelPoiId(null);
  }

  function handleMapDetour(lat: number, lon: number) {
    if (!selectedTrail) return;
    const d = createDetourPoi(selectedTrail.points, lat, lon,
      `Detour ${selectedTrail.pois.filter(p => p.kind === 'detour').length + 1}`,
      'Branching scenic stop.');
    patch(selectedTrail.id, t => ({ ...t, pois: [...t.pois, d], reputation: t.reputation + 5 }));
    setSelPoiId(d.id);
    setSelCpIdx(d.anchorPointIndex ?? null);
  }

  function handleMapCpUpdate(index: number, lat: number, lon: number) {
    if (!selectedTrail) return;
    patch(selectedTrail.id, t => ({
      ...t, points: t.points.map((p, i) => i === index ? { ...p, lat, lon } : p),
    }));
    setSelCpIdx(index); setSelPoiId(null);
  }

  function handleMapPoiAtLine(lat: number, lon: number) {
    if (!selectedTrail) return;
    const kind = (poiForm.kind === 'detour' ? 'scenic' : poiForm.kind) as TrailPoi['kind'];
    const poi: TrailPoi = {
      id: createTrailId('poi'),
      name: poiForm.name.trim() || `POI ${selectedTrail.pois.length + 1}`,
      note: poiForm.note.trim() || 'From map.',
      lat, lon, kind,
      rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(kind)),
      anchorPointIndex: selCpIdx ?? 0,
      distanceFromTrailM: Math.round(metersFromTrail(selectedTrail.points, lat, lon)),
    };
    patch(selectedTrail.id, t => ({ ...t, pois: [...t.pois, poi], reputation: t.reputation + 4 }));
    setSelPoiId(poi.id);
  }

  function handleMapPoiUpdate(poiId: string, lat: number, lon: number) {
    if (!selectedTrail) return;
    patch(selectedTrail.id, t => ({
      ...t, pois: t.pois.map(p => p.id === poiId
        ? { ...p, lat, lon, distanceFromTrailM: Math.round(metersFromTrail(t.points, lat, lon)) }
        : p),
    }));
  }

  function handleCpDrop(targetIdx: number) {
    if (!selectedTrail || dragCpIdx === null || dragCpIdx === targetIdx) return;
    patch(selectedTrail.id, t => ({ ...t, points: moveTrailPoint(t.points, dragCpIdx, targetIdx) }));
    setSelCpIdx(targetIdx); setDragCpIdx(null);
    setNoticeTemp('Checkpoint order updated.');
  }

  function handlePoiDragStart(e: DragEvent, poiId: string) {
    setDragPoiId(poiId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handlePoiDragOver(e: DragEvent, poiId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPoiId(poiId);
  }

  function handlePoiDrop(e: DragEvent, targetPoiId: string) {
    e.preventDefault();
    if (!selectedTrail || !dragPoiId || dragPoiId === targetPoiId) {
      setDragPoiId(null); setDragOverPoiId(null); return;
    }
    patch(selectedTrail.id, t => {
      const pois = [...t.pois];
      const fromIdx = pois.findIndex(p => p.id === dragPoiId);
      const toIdx   = pois.findIndex(p => p.id === targetPoiId);
      if (fromIdx < 0 || toIdx < 0) return t;
      const [moved] = pois.splice(fromIdx, 1);
      pois.splice(toIdx, 0, moved);
      return { ...t, pois };
    });
    setDragPoiId(null); setDragOverPoiId(null);
    setNoticeTemp('POI order updated.');
  }

  function handlePoiDragEnd() {
    setDragPoiId(null); setDragOverPoiId(null);
  }

  function handleAddPoi() {
    if (!selectedTrail) return;
    if (!poiForm.name.trim()) { setError('Name the POI first.'); return; }
    const fb = selectedTrail.points[Math.floor(selectedTrail.points.length / 2)] || { lat: geo?.lat ?? 59.33, lon: geo?.lon ?? 18.07 };
    const poi: TrailPoi = poiForm.kind === 'detour'
      ? {
          ...projectDetourPoi(selectedTrail.points, Math.max(60, Number(poiForm.offsetMeters) || 180),
            poiForm.name.trim(), poiForm.note.trim()),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints('detour')),
        }
      : {
          id: createTrailId('poi'),
          name: poiForm.name.trim(), note: poiForm.note.trim(),
          lat: Number(poiForm.lat) || geo?.lat || fb.lat,
          lon: Number(poiForm.lon) || geo?.lon || fb.lon,
          kind: poiForm.kind,
          distanceFromTrailM: Math.round(metersFromTrail(
            selectedTrail.points,
            Number(poiForm.lat) || geo?.lat || fb.lat,
            Number(poiForm.lon) || geo?.lon || fb.lon,
          )),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(poiForm.kind)),
          anchorPointIndex: selCpIdx ?? 0,
        };

    patch(selectedTrail.id, t => ({
      ...t, pois: [...t.pois, poi],
      reputation: t.reputation + (poi.kind === 'detour' ? 6 : 4),
    }));
    setPoiForm({ name: '', note: '', kind: 'checkpoint', offsetMeters: '180', rewardPoints: '10', lat: '', lon: '' });
    setNoticeTemp('POI added.');
    setError(null);
  }

  function addNearbyPoi(p: NearbyPoi) {
    if (!selectedTrail) return;
    patch(selectedTrail.id, t => {
      if (t.pois.some(x => x.externalPoiId === p.id)) return t;
      return {
        ...t, pois: [...t.pois, {
          id: createTrailId('poi'), name: p.name,
          note: p.description || 'Live POI.', lat: p.latitude, lon: p.longitude,
          kind: 'checkpoint' as TrailPoi['kind'], externalPoiId: p.id,
          distanceFromTrailM: Math.round(metersFromTrail(t.points, p.latitude, p.longitude)),
          rewardPoints: defaultRewardPoints('checkpoint'),
          anchorPointIndex: t.points.length ? 0 : undefined,
        }],
      };
    });
    setNoticeTemp('Live POI attached.');
  }

  async function handlePublish(trail: TrailDraft, mintNow = false) {
    setBusyTrailId(trail.id); setError(null);
    try {
      if (trail.publishedRouteId) {
        patch(trail.id, t => ({ ...t, published: true, minted: mintNow || t.minted, views: t.views + 8, reputation: t.reputation + (mintNow ? 14 : 8) }));
        setNoticeTemp(mintNow ? 'Minted and locked.' : 'Already published.');
        return;
      }
      const liveIds = trail.pois.map(p => p.externalPoiId).filter(Boolean);
      if (liveIds.length >= 2) {
        const route = await api.createRoute({
          name: trail.name, description: trail.description, difficulty: trail.difficulty,
          estimated_duration_min: trail.durationMin, poi_ids: liveIds,
          build_mode: trail.importedFrom ? 'auto' : 'manual', is_loop: false,
          is_minted: mintNow || trail.minted,
          route_points: trail.points.map((p, i) => ({
            latitude: p.lat, longitude: p.lon, altitude: p.ele ?? null,
            label: p.label || `Point ${i + 1}`, timestamp: p.timestamp || new Date().toISOString(),
          })),
          checkpoints: trail.pois.map((p, i) => ({
            id: p.externalPoiId || p.id, name: p.name,
            latitude: p.lat, longitude: p.lon, position: i, kind: p.kind,
          })),
        });
        patch(trail.id, t => ({ ...t, publishedRouteId: route.id, published: true, minted: mintNow || t.minted, distanceKm: Number(route.distance_km) || t.distanceKm, views: t.views + 24, reputation: t.reputation + (mintNow ? 20 : 10) }));
        setNoticeTemp(mintNow ? 'Published & minted.' : 'Published to OnTrail API.');
      } else {
        patch(trail.id, t => ({ ...t, published: true, minted: mintNow || t.minted, views: t.views + 10, reputation: t.reputation + (mintNow ? 16 : 8) }));
        setNoticeTemp('Published in draft mode. Attach 2+ live POIs for full API sync.');
      }
    } catch (err: any) { setError(err?.message || 'Publish failed.'); }
    finally { setBusyTrailId(null); }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (!canDeleteTrail(deleteTarget)) { setError('Minted trails cannot be deleted.'); setDeleteTarget(null); return; }
    setTrails(c => c.filter(t => t.id !== deleteTarget.id));
    setSelectedTrailId((id: string | null) => (id === deleteTarget.id ? null : id));
    setNoticeTemp('Trail deleted.');
    setDeleteTarget(null);
  }

  function selectTrail(id: string) {
    setSelectedTrailId(id);
    setSelCpIdx(null); setSelPoiId(null);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function refreshGps() {
    if (!navigator.geolocation) { setError('GPS unavailable.'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setGeo({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }); setNoticeTemp('GPS refreshed.'); },
      () => setError('GPS access denied.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} flex-shrink-0 bg-white border-r border-gray-100 flex flex-col transition-all duration-200 overflow-hidden`}>
        <div className="h-12 flex items-center gap-2 px-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-800 flex-1 truncate">Trail Lab</span>
          <span className="text-[10px] text-gray-400">{trails.length} trails</span>
        </div>

        <div className="px-3 py-2 flex-shrink-0">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Filter trails..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <div className="px-3 pb-2 flex gap-1.5 flex-shrink-0">
          <button onClick={handleCreateTrail}
            className="flex-1 rounded-xl bg-gray-900 text-white text-[10px] font-bold py-1.5 hover:bg-emerald-600 transition-colors">
            + New
          </button>
          <label className="flex-1 cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold py-1.5 text-center hover:bg-emerald-100 transition-colors">
            {importing ? '...' : 'Import'}
            <input type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={handleImportFile} />
          </label>
          <button onClick={() => loadFromApi()}
            className="rounded-xl border border-gray-200 bg-white text-gray-500 text-[10px] font-bold px-2 py-1.5 hover:bg-gray-50 transition-colors" title="Reload from API">
            Reload
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {loading && <p className="text-center text-xs text-gray-400 py-4">Loading...</p>}
          {!loading && filteredTrails.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-6">No trails. Create or import one.</p>
          )}
          {filteredTrails.map(t => (
            <SidebarRow key={t.id} trail={t} selected={t.id === selectedTrailId} onEdit={() => selectTrail(t.id)} />
          ))}
        </div>

        <div className="border-t border-gray-100 px-3 py-2 flex gap-1.5 flex-shrink-0">
          <button onClick={handleSave}
            className={`flex-1 rounded-xl text-[10px] font-bold py-1.5 transition-colors ${savedFlash ? 'bg-emerald-500 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {savedFlash ? 'Saved!' : 'Save local'}
          </button>
          <button onClick={handleExportJson}
            className="flex-1 rounded-xl border border-gray-200 text-gray-500 text-[10px] font-bold py-1.5 hover:bg-gray-50 transition-colors">
            Export JSON
          </button>
          <label className="flex-1 cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold py-1.5 text-center hover:bg-emerald-100 transition-colors">
            Load JSON
            <input ref={importJsonRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
          </label>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-gray-800">Trail Lab</span>
            {selectedTrail && (
              <span className="ml-2 text-xs text-gray-400 truncate"> &rsaquo; {selectedTrail.name}</span>
            )}
          </div>

          <div className="flex gap-1.5 items-center">
            <input
              placeholder="Load runner..."
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) loadFromApi(v);
                }
              }}
            />
            <button onClick={refreshGps}
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors" title="Refresh GPS">
              GPS
            </button>
            <button onClick={() => setGalleryOpen(o => !o)}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${galleryOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Gallery
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">

          {(notice || error) && (
            <div className={`rounded-2xl border px-4 py-2.5 text-xs flex items-center justify-between ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              <span>{error || notice}</span>
              <button onClick={() => { setError(null); setNotice(null); }} className="ml-4 opacity-60 hover:opacity-100">x</button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
            <StatBento label="Trails" value={String(trails.length)} note="in studio" accent="border-emerald-100" />
            <StatBento label="Views" value={String(totalViews)} note="total" />
            <StatBento label="Reputation" value={String(totalReputation)} note="combined" />
            <StatBento label="POI pts" value={String(totalPoiRewards)} note="active trail" />
            <StatBento label="Published" value={String(trails.filter(t => t.published).length)} note="live" accent="border-green-100" />
            <StatBento label="Minted" value={String(trails.filter(t => t.minted).length)} note="locked" accent="border-amber-100" />
          </div>

          {galleryOpen && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Trail gallery &mdash; {filteredTrails.length} trail{filteredTrails.length !== 1 ? 's' : ''}
                </p>
              </div>
              {filteredTrails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
                  {loading ? 'Loading...' : 'No trails. Create a new draft or import a file.'}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 auto-rows-auto">
                  {filteredTrails.map((trail, i) => (
                    <BentoTrailCard
                      key={trail.id}
                      trail={trail}
                      selected={trail.id === selectedTrailId}
                      spotlight={i % 5 === 0}
                      busy={busyTrailId === trail.id}
                      onEdit={() => selectTrail(trail.id)}
                      onPublish={() => handlePublish(trail)}
                      onMint={() => handlePublish(trail, true)}
                      onDelete={() => setDeleteTarget(trail)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <div ref={editorRef}>
            {!selectedTrail ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
                Select a trail from the sidebar or gallery to open the editor.
              </div>
            ) : (
              <div className="grid xl:grid-cols-[1fr_360px] gap-5">

                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{selectedTrail.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {selectedTrail.ownerName}
                        {selectedTrail.distanceKm > 0 && ` · ${selectedTrail.distanceKm.toFixed(2)} km`}
                        {selectedTrail.publishedRouteId && ` · ID: ${selectedTrail.publishedRouteId}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {!selectedTrail.published && (
                        <button onClick={() => handlePublish(selectedTrail)} disabled={!!busyTrailId}
                          className="rounded-xl bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-600 transition-colors disabled:opacity-40">
                          Publish
                        </button>
                      )}
                      {!selectedTrail.minted && (
                        <button onClick={() => handlePublish(selectedTrail, true)} disabled={!!busyTrailId}
                          className="rounded-xl bg-amber-500 text-white px-3 py-1.5 text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-40">
                          Mint and lock
                        </button>
                      )}
                      {canDeleteTrail(selectedTrail) && (
                        <button onClick={() => setDeleteTarget(selectedTrail)}
                          className="rounded-xl border border-red-200 text-red-500 px-3 py-1.5 text-xs font-bold hover:bg-red-50 transition-colors">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mr-1">Map editor</p>
                      {([
                        { key: 'select',     label: 'Select' },
                        { key: 'checkpoint', label: 'Checkpoint' },
                        { key: 'detour',     label: 'Detour' },
                      ] as const).map(m => (
                        <button key={m.key} onClick={() => setMapMode(m.key)}
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${mapMode === m.key ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                          {m.label}
                        </button>
                      ))}
                      <span className="ml-auto rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                        {selectedTrail.points.length} pts · {totalPoiRewards} POI pts
                      </span>
                    </div>
                    <div className="h-[460px]">
                      <TrailMapEditor
                        trail={selectedTrail}
                        canEdit={true}
                        mode={mapMode}
                        selectedCheckpointIndex={selCpIdx}
                        selectedPoiId={selPoiId}
                        onSelectCheckpoint={setSelCpIdx}
                        onSelectPoi={setSelPoiId}
                        onAddCheckpoint={handleMapCheckpoint}
                        onAddDetour={handleMapDetour}
                        onAddPoiAtLine={handleMapPoiAtLine}
                        onUpdateCheckpoint={handleMapCpUpdate}
                        onUpdatePoi={handleMapPoiUpdate}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex border-b border-gray-100 flex-shrink-0">
                    {([
                      { id: 'details',     label: 'Details' },
                      { id: 'checkpoints', label: `CPs (${selectedTrail.points.length})` },
                      { id: 'pois',        label: `POIs (${selectedTrail.pois.length})` },
                      { id: 'nearby',      label: 'Nearby' },
                    ] as const).map(tab => (
                      <button key={tab.id} onClick={() => setEditorTab(tab.id)}
                        className={`flex-1 py-2.5 text-[10px] font-bold transition ${editorTab === tab.id ? 'border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50/50' : 'text-gray-400 hover:text-gray-600'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">

                    {editorTab === 'details' && (
                      <div className="grid gap-3 grid-cols-2">
                        <div className="col-span-2">
                          <Field label="Trail name">
                            <input value={selectedTrail.name}
                              onChange={e => handleField('name', e.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          </Field>
                        </div>
                        <Field label="Region">
                          <input value={selectedTrail.region}
                            onChange={e => handleField('region', e.target.value)}
                            placeholder="e.g. Northern ridge"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </Field>
                        <Field label="Difficulty">
                          <select value={selectedTrail.difficulty}
                            onChange={e => handleField('difficulty', e.target.value as TrailDraft['difficulty'])}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300">
                            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </Field>
                        <Field label="Surface">
                          <input value={selectedTrail.surface}
                            onChange={e => handleField('surface', e.target.value)}
                            placeholder="Singletrack, gravel..."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </Field>
                        <Field label="Duration (min)">
                          <input type="number" min={15} value={selectedTrail.durationMin}
                            onChange={e => handleField('durationMin', Number(e.target.value) || 15)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </Field>
                        <div className="col-span-2">
                          <Field label="Description">
                            <textarea rows={3} value={selectedTrail.description}
                              onChange={e => handleField('description', e.target.value)}
                              placeholder="What makes this trail special..."
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          </Field>
                        </div>
                        <div className="col-span-2 grid grid-cols-3 gap-2">
                          {[
                            { l: 'Distance', v: `${selectedTrail.distanceKm.toFixed(2)} km` },
                            { l: 'Views',    v: String(selectedTrail.views) },
                            { l: 'Rep',      v: String(selectedTrail.reputation) },
                          ].map(({ l, v }) => (
                            <div key={l} className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 text-center">
                              <p className="text-[9px] text-gray-400">{l}</p>
                              <p className="text-sm font-black text-gray-900">{v}</p>
                            </div>
                          ))}
                        </div>
                        <div className="col-span-2 text-[9px] text-gray-400">
                          Source: {selectedTrail.sourceFormat || 'Manual draft'}
                        </div>
                      </div>
                    )}

                    {editorTab === 'checkpoints' && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-400">Drag rows to reorder. Click to select on map.</p>
                        {selectedTrail.points.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                            No checkpoints. Use Checkpoint mode on the map.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
                            {selectedTrail.points.map((pt, i) => (
                              <div key={`${pt.lat}-${pt.lon}-${i}`}
                                draggable
                                onDragStart={() => setDragCpIdx(i)}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => handleCpDrop(i)}
                                onClick={() => { setSelCpIdx(i); setSelPoiId(null); }}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl cursor-pointer border transition-all select-none ${selCpIdx === i ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-gray-50 hover:bg-white'}`}>
                                <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-semibold text-gray-700 truncate">{pt.label || `Checkpoint ${i + 1}`}</p>
                                  <p className="text-[9px] text-gray-400">{pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}{pt.ele != null ? ` · ${pt.ele.toFixed(0)} m` : ''}</p>
                                </div>
                                <button onClick={e => { e.stopPropagation(); patch(selectedTrail.id, t => ({ ...t, points: t.points.filter((_, j) => j !== i) })); setSelCpIdx(null); }}
                                  className="text-gray-300 hover:text-red-500 transition-colors text-sm flex-shrink-0">x</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editorTab === 'pois' && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Add POI</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input value={poiForm.name} onChange={e => setPoiForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Name *"
                              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                            <select value={poiForm.kind} onChange={e => setPoiForm(f => ({ ...f, kind: e.target.value as TrailPoi['kind'] }))}
                              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300">
                              <option value="checkpoint">Checkpoint</option>
                              <option value="detour">Detour</option>
                              <option value="scenic">Scenic</option>
                              <option value="water">Water</option>
                              <option value="photo">Photo spot</option>
                            </select>
                            <input value={poiForm.note} onChange={e => setPoiForm(f => ({ ...f, note: e.target.value }))}
                              placeholder="Note"
                              className="col-span-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                            {poiForm.kind === 'detour' ? (
                              <input value={poiForm.offsetMeters} onChange={e => setPoiForm(f => ({ ...f, offsetMeters: e.target.value }))}
                                placeholder="Offset m"
                                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                            ) : (
                              <>
                                <input value={poiForm.lat} onChange={e => setPoiForm(f => ({ ...f, lat: e.target.value }))}
                                  placeholder="Lat (or click map)"
                                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                                <input value={poiForm.lon} onChange={e => setPoiForm(f => ({ ...f, lon: e.target.value }))}
                                  placeholder="Lon"
                                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                              </>
                            )}
                            <input value={poiForm.rewardPoints} onChange={e => setPoiForm(f => ({ ...f, rewardPoints: e.target.value }))}
                              placeholder="Reward pts"
                              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                          </div>
                          <button onClick={handleAddPoi}
                            className="w-full rounded-lg bg-gray-900 text-white text-[10px] font-bold py-1.5 hover:bg-emerald-600 transition-colors">
                            Add to trail
                          </button>
                        </div>

                        {selectedTrail.pois.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                            No POIs. Add via the form or click a map connector line.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
                            <p className="text-[9px] text-gray-400 pl-1">Drag to reorder · Click to select on map</p>
                            {selectedTrail.pois.map(poi => (
                              <PoiRow
                                key={poi.id}
                                poi={poi}
                                selected={selPoiId === poi.id}
                                dragOver={dragOverPoiId === poi.id}
                                onSelect={() => setSelPoiId(poi.id)}
                                onRewardChange={pts => patch(selectedTrail.id, t => ({ ...t, pois: t.pois.map(p => p.id === poi.id ? { ...p, rewardPoints: Math.max(0, pts) } : p) }))}
                                onRemove={() => { patch(selectedTrail.id, t => ({ ...t, pois: t.pois.filter(p => p.id !== poi.id) })); setNoticeTemp('POI removed.'); }}
                                onDragStart={e => handlePoiDragStart(e, poi.id)}
                                onDragOver={e => handlePoiDragOver(e, poi.id)}
                                onDrop={e => handlePoiDrop(e, poi.id)}
                                onDragEnd={handlePoiDragEnd}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editorTab === 'nearby' && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-400">Live OnTrail POIs near your GPS. Attach 2+ to enable full route API sync.</p>
                        {nearbyPois.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                            No nearby POIs. Refresh GPS and try again.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
                            {nearbyPois.map(p => {
                              const attached = selectedTrail.pois.some(x => x.externalPoiId === p.id);
                              return (
                                <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-gray-800 truncate">{p.name}</p>
                                    {p.description && <p className="text-[9px] text-gray-400 truncate">{p.description}</p>}
                                    <p className="text-[9px] text-gray-400">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</p>
                                  </div>
                                  <button onClick={() => addNearbyPoi(p)} disabled={attached}
                                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors flex-shrink-0 ${attached ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white hover:bg-emerald-600'}`}>
                                    {attached ? 'Added' : 'Attach'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0">
                    <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest mb-1.5">
                      {SUPPORTED_IMPORT_FORMATS.length} import formats
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {SUPPORTED_IMPORT_FORMATS.slice(0, 12).map(f => (
                        <span key={f} className="text-[8px] bg-gray-50 border border-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{f}</span>
                      ))}
                      {SUPPORTED_IMPORT_FORMATS.length > 12 && (
                        <span className="text-[8px] bg-gray-50 border border-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">+{SUPPORTED_IMPORT_FORMATS.length - 12} more</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900">Delete trail?</h3>
            <p className="text-xs text-gray-500 mt-2">
              "{deleteTarget.name}" will be removed from the studio.
              {deleteTarget.publishedRouteId && ' The API route will not be affected.'}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDelete}
                className="flex-1 rounded-xl bg-red-500 text-white font-bold py-2 text-xs hover:bg-red-600 transition-colors">
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 text-gray-600 font-bold py-2 text-xs hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
