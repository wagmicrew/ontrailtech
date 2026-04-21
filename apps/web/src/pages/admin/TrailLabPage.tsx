import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../../lib/api';
import TrailMapEditor from '../../components/TrailMapEditor';
import {
  SUPPORTED_IMPORT_FORMATS,
  calculateDistanceMeters,
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

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';
const DIFFICULTIES: TrailDraft['difficulty'][] = ['easy', 'moderate', 'hard', 'expert'];
const IMPORT_ACCEPT = '.gpx,.kml,.kmz,.csv,.json,.geojson,.xml,.tcx,.crs,.fit,.pwx,.nmea,.ovl,.itn,.sdf,.trc,.rss,.txt,.xls,.xlsx,.bin';

type NearbyPoi = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
};

type GeoState = { lat: number; lon: number; accuracy: number };

function normalizeTrail(trail: TrailDraft): TrailDraft {
  const syncedPois = syncPoiConnections(trail.points, trail.pois);
  return {
    ...trail,
    pois: syncedPois,
    distanceKm: trail.points.length > 1 ? calculateTrailDistanceKm(trail.points) : trail.distanceKm,
    updatedAt: new Date().toISOString(),
  };
}

function difficultyFromDistance(km: number): TrailDraft['difficulty'] {
  if (km >= 25) return 'expert';
  if (km >= 14) return 'hard';
  if (km >= 6) return 'moderate';
  return 'easy';
}

function mapApiRoute(route: any): TrailDraft {
  const completions = Number(route.completion_count) || 0;
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
    views: Math.max(32, completions * 18),
    reputation: Math.max(24, completions * 12 + (route.is_minted ? 40 : 0)),
    published: true,
    minted: Boolean(route.is_minted),
    importedFrom: 'route api',
    sourceFormat: route.build_mode === 'auto' ? 'OnTrail mobile GPS' : 'OnTrail mobile manual builder',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    points: [],
    pois: [],
    photoSubmissions: [],
  };
}

/* ── Stat card ── */
function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-3xl font-black text-gray-900 mt-1 leading-none">{value}</p>
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

/* ── Field wrapper ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ── Trail card ── */
function TrailCard({
  trail, selected, busy, onEdit, onPublish, onMint, onDelete,
}: {
  trail: TrailDraft;
  selected: boolean;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onMint: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-md ${selected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-100'}`}
      onClick={onEdit}
    >
      <div className={`h-1.5 w-full ${trail.minted ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : trail.published ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-gray-200 to-gray-300'}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{trail.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {trail.ownerName} · {trail.distanceKm > 0 ? `${trail.distanceKm.toFixed(1)} km` : 'draft'} · {trail.difficulty}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            {trail.minted && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Minted</span>}
            {trail.published && !trail.minted && <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Published</span>}
            {!trail.published && <span className="text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">Draft</span>}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-50 py-1.5">
            <p className="text-xs font-bold text-gray-900">{trail.points.length}</p>
            <p className="text-[10px] text-gray-400">pts</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-1.5">
            <p className="text-xs font-bold text-gray-900">{trail.pois.length}</p>
            <p className="text-[10px] text-gray-400">POIs</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-1.5">
            <p className="text-xs font-bold text-gray-900">{trail.views}</p>
            <p className="text-[10px] text-gray-400">views</p>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit}
            className="flex-1 rounded-lg bg-gray-900 text-white text-xs font-semibold py-1.5 hover:bg-emerald-600 transition-colors">
            Edit
          </button>
          {!trail.published && (
            <button onClick={onPublish} disabled={busy}
              className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold py-1.5 hover:bg-emerald-100 transition-colors disabled:opacity-50">
              Publish
            </button>
          )}
          {!trail.minted && (
            <button onClick={onMint} disabled={busy}
              className="flex-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold py-1.5 hover:bg-amber-100 transition-colors disabled:opacity-50">
              Mint
            </button>
          )}
          {canDeleteTrail(trail) && (
            <button onClick={onDelete} disabled={busy}
              className="rounded-lg border border-red-100 bg-red-50 text-red-500 text-xs font-semibold px-2.5 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-50">
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main TrailLabPage component
══════════════════════════════════════════ */
export default function TrailLabPage() {
  const [trails, setTrails] = useState<TrailDraft[]>([]);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyTrailId, setBusyTrailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [runnerSearch, setRunnerSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Map editor
  const [mapEditorMode, setMapEditorMode] = useState<'select' | 'checkpoint' | 'detour'>('select');
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState<number | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [dragCheckpointIndex, setDragCheckpointIndex] = useState<number | null>(null);

  // POI form
  const [poiForm, setPoiForm] = useState({
    name: '', note: '', kind: 'checkpoint' as TrailPoi['kind'],
    offsetMeters: '180', rewardPoints: '10', lat: '', lon: '',
  });

  // Nearby POIs
  const [nearbyPois, setNearbyPois] = useState<NearbyPoi[]>([]);
  const [geo, setGeo] = useState<GeoState | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<TrailDraft | null>(null);

  // Tab in editor panel
  const [editorTab, setEditorTab] = useState<'details' | 'checkpoints' | 'pois' | 'nearby'>('details');

  const editorRef = useRef<HTMLDivElement | null>(null);

  const selectedTrail = useMemo(
    () => trails.find(t => t.id === selectedTrailId) ?? null,
    [selectedTrailId, trails],
  );

  const totalViews = useMemo(() => trails.reduce((s, t) => s + t.views, 0), [trails]);
  const totalReputation = useMemo(() => trails.reduce((s, t) => s + t.reputation, 0), [trails]);
  const totalPoiRewards = useMemo(
    () => selectedTrail?.pois.reduce((s, p) => s + (p.rewardPoints || 0), 0) ?? 0,
    [selectedTrail],
  );

  /* ── Geo ── */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (!geo) return;
    api.getNearbyPois(geo.lat, geo.lon, 15)
      .then(items => setNearbyPois(items || []))
      .catch(() => undefined);
  }, [geo]);

  /* ── Load trails ── */
  async function loadTrails(runner?: string) {
    setLoading(true);
    setError(null);
    try {
      const routes = runner
        ? await api.getRoutesByRunner(runner)
        : await api.getMyRoutes();
      const mapped = routes.map(mapApiRoute);
      setTrails(mapped);
      if (mapped.length) setSelectedTrailId(mapped[0].id);
      else setSelectedTrailId(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load trails');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrails(); }, []);

  /* ── Patch helper ── */
  function patchTrail(trailId: string, updater: (t: TrailDraft) => TrailDraft) {
    setTrails(current => current.map(t => t.id === trailId ? normalizeTrail(updater(t)) : t));
  }

  /* ── Handlers ── */
  function handleCreateTrail() {
    const token = localStorage.getItem('ontrail_token');
    const trail = createStarterTrail('admin', 'Admin');
    trail.id = createTrailId();
    trail.name = `Admin trail draft ${trails.length + 1}`;
    trail.views = 0;
    trail.reputation = 0;
    setTrails(c => [trail, ...c]);
    setSelectedTrailId(trail.id);
    setNotice('New trail draft created. Add checkpoints from the map or import a file.');
    setError(null);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const parsed = await parseTrailImportFile(file);
      const base = selectedTrail ?? createStarterTrail('admin', 'Admin');
      const next = normalizeTrail({
        ...base,
        id: selectedTrail?.id ?? createTrailId(),
        name: parsed.name || base.name,
        description: base.description || `Imported from ${parsed.sourceFormat}.`,
        difficulty: difficultyFromDistance(parsed.distanceKm || base.distanceKm),
        durationMin: parsed.estimatedDurationMin || base.durationMin,
        importedFrom: file.name,
        sourceFormat: parsed.sourceFormat,
        points: parsed.points.length ? parsed.points : base.points,
        pois: [...base.pois, ...parsed.pois],
        published: false,
      });
      setTrails(c => {
        const exists = c.some(t => t.id === next.id);
        return exists ? c.map(t => t.id === next.id ? next : t) : [next, ...c];
      });
      setSelectedTrailId(next.id);
      setNotice(`Imported ${parsed.sourceFormat} — ${parsed.points.length} points, ${parsed.pois.length} POIs.${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''}`);
    } catch (e: any) {
      setError(e?.message || 'Import failed. Try GPX, KML, TCX, CSV, or JSON.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  function handleTrailField<K extends keyof TrailDraft>(field: K, value: TrailDraft[K]) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({ ...t, [field]: value }));
  }

  /* ── Map handlers ── */
  function handleMapAddCheckpoint(lat: number, lon: number) {
    if (!selectedTrail) return;
    const idx = selectedCheckpointIndex ?? Math.max(0, selectedTrail.points.length - 1);
    patchTrail(selectedTrail.id, t => ({
      ...t,
      points: insertTrailPoint(t.points, idx, { lat, lon, label: `Checkpoint ${idx + 2}`, timestamp: new Date().toISOString() }),
      reputation: t.reputation + 2,
    }));
    setSelectedCheckpointIndex(Math.max(0, idx + 1));
    setSelectedPoiId(null);
    setNotice('Checkpoint added. Drag it to refine the route line.');
  }

  function handleMapAddDetour(lat: number, lon: number) {
    if (!selectedTrail) return;
    const detour = createDetourPoi(
      selectedTrail.points, lat, lon,
      `Detour ${selectedTrail.pois.filter(p => p.kind === 'detour').length + 1}`,
      'Branching scenic stop added from the OSM editor.',
    );
    patchTrail(selectedTrail.id, t => ({ ...t, pois: [...t.pois, detour], reputation: t.reputation + 5 }));
    setSelectedPoiId(detour.id);
    setSelectedCheckpointIndex(detour.anchorPointIndex ?? null);
    setNotice('Detour checkpoint added and anchored to the nearest main checkpoint.');
  }

  function handleMapCheckpointUpdate(index: number, lat: number, lon: number) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({
      ...t,
      points: t.points.map((p, i) => i === index ? { ...p, lat, lon } : p),
    }));
    setSelectedCheckpointIndex(index);
    setSelectedPoiId(null);
    setNotice('Checkpoint moved. POI links refreshed.');
  }

  function handleMapAddPoiAtLine(lat: number, lon: number) {
    if (!selectedTrail) return;
    const name = poiForm.name.trim() || `POI ${selectedTrail.pois.length + 1}`;
    const kind = poiForm.kind === 'detour' ? 'scenic' : poiForm.kind;
    const poi: TrailPoi = {
      id: createTrailId('poi'),
      name,
      note: poiForm.note.trim() || 'Added from map connector line.',
      lat, lon, kind,
      rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(kind)),
      anchorPointIndex: selectedCheckpointIndex ?? 0,
      distanceFromTrailM: Math.round(metersFromTrail(selectedTrail.points, lat, lon)),
    };
    patchTrail(selectedTrail.id, t => ({ ...t, pois: [...t.pois, poi], reputation: t.reputation + 4 }));
    setSelectedPoiId(poi.id);
    setNotice('POI added on connector line.');
  }

  function handleMapPoiUpdate(poiId: string, lat: number, lon: number) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({
      ...t,
      pois: t.pois.map(p => p.id === poiId
        ? { ...p, lat, lon, distanceFromTrailM: Math.round(metersFromTrail(t.points, lat, lon)) }
        : p),
    }));
  }

  function handleCheckpointDrop(targetIndex: number) {
    if (!selectedTrail || dragCheckpointIndex === null || dragCheckpointIndex === targetIndex) return;
    patchTrail(selectedTrail.id, t => ({ ...t, points: moveTrailPoint(t.points, dragCheckpointIndex, targetIndex) }));
    setSelectedCheckpointIndex(targetIndex);
    setDragCheckpointIndex(null);
    setNotice('Checkpoint order updated.');
  }

  function handleAddPoi() {
    if (!selectedTrail) return;
    if (!poiForm.name.trim()) { setError('Name the POI first.'); return; }
    const fallback = selectedTrail.points[Math.floor(selectedTrail.points.length / 2)] || { lat: geo?.lat ?? 59.33, lon: geo?.lon ?? 18.07 };
    const poi = poiForm.kind === 'detour'
      ? {
          ...projectDetourPoi(selectedTrail.points, Math.max(60, Number(poiForm.offsetMeters) || 180), poiForm.name.trim(), poiForm.note.trim()),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints('detour')),
        }
      : {
          id: createTrailId('poi'),
          name: poiForm.name.trim(),
          note: poiForm.note.trim(),
          lat: Number(poiForm.lat) || geo?.lat || fallback.lat,
          lon: Number(poiForm.lon) || geo?.lon || fallback.lon,
          kind: poiForm.kind,
          distanceFromTrailM: Math.round(metersFromTrail(selectedTrail.points, Number(poiForm.lat) || geo?.lat || fallback.lat, Number(poiForm.lon) || geo?.lon || fallback.lon)),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(poiForm.kind)),
          anchorPointIndex: selectedCheckpointIndex ?? 0,
        } as TrailPoi;

    patchTrail(selectedTrail.id, t => ({
      ...t,
      pois: [...t.pois, poi],
      reputation: t.reputation + (poi.kind === 'detour' ? 6 : 4),
    }));
    setPoiForm({ name: '', note: '', kind: 'checkpoint', offsetMeters: '180', rewardPoints: '10', lat: '', lon: '' });
    setNotice(poi.kind === 'detour' ? 'Detour POI added.' : 'POI added to the trail.');
    setError(null);
  }

  function addNearbyPoi(poi: NearbyPoi) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => {
      if (t.pois.some(p => p.externalPoiId === poi.id)) return t;
      return {
        ...t,
        pois: [...t.pois, {
          id: createTrailId('poi'),
          name: poi.name,
          note: poi.description || 'Live POI from nearby.',
          lat: poi.latitude,
          lon: poi.longitude,
          kind: 'checkpoint' as TrailPoi['kind'],
          externalPoiId: poi.id,
          distanceFromTrailM: Math.round(metersFromTrail(t.points, poi.latitude, poi.longitude)),
          rewardPoints: defaultRewardPoints('checkpoint'),
          anchorPointIndex: t.points.length ? 0 : undefined,
        }],
      };
    });
    setNotice('Live POI attached to trail.');
  }

  function handlePoiRewardChange(poiId: string, pts: number) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({
      ...t,
      pois: t.pois.map(p => p.id === poiId ? { ...p, rewardPoints: Math.max(0, pts) } : p),
    }));
  }

  function handleRemovePoi(poiId: string) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({ ...t, pois: t.pois.filter(p => p.id !== poiId) }));
    setNotice('POI removed.');
  }

  function handleRemoveCheckpoint(index: number) {
    if (!selectedTrail) return;
    patchTrail(selectedTrail.id, t => ({ ...t, points: t.points.filter((_, i) => i !== index) }));
    setSelectedCheckpointIndex(null);
    setNotice('Checkpoint removed.');
  }

  async function handlePublishTrail(trail: TrailDraft, mintNow = false) {
    setBusyTrailId(trail.id);
    setError(null);
    try {
      if (trail.publishedRouteId) {
        patchTrail(trail.id, t => ({ ...t, published: true, minted: mintNow ? true : t.minted, views: t.views + (mintNow ? 16 : 8), reputation: t.reputation + (mintNow ? 14 : 8) }));
        setNotice(mintNow ? 'Trail marked as minted and locked.' : 'Trail already published.');
        return;
      }
      const livePoiIds = trail.pois.map(p => p.externalPoiId).filter(Boolean);
      if (livePoiIds.length >= 2) {
        const route = await api.createRoute({
          name: trail.name,
          description: trail.description,
          difficulty: trail.difficulty,
          estimated_duration_min: trail.durationMin,
          poi_ids: livePoiIds,
          build_mode: trail.importedFrom ? 'auto' : 'manual',
          is_loop: false,
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
        patchTrail(trail.id, t => ({
          ...t, publishedRouteId: route.id, published: true,
          minted: mintNow || t.minted, distanceKm: Number(route.distance_km) || t.distanceKm,
          views: t.views + 24, reputation: t.reputation + (mintNow ? 20 : 10),
        }));
        setNotice(mintNow ? 'Trail published and minted.' : 'Trail published to OnTrail route API.');
      } else {
        patchTrail(trail.id, t => ({ ...t, published: true, minted: mintNow || t.minted, views: t.views + 10, reputation: t.reputation + (mintNow ? 16 : 8) }));
        setNotice(mintNow
          ? 'Trail minted in studio. Attach ≥2 live POIs to sync with the route API.'
          : 'Trail published in draft mode. Attach ≥2 live POIs for full API sync.');
      }
    } catch (e: any) {
      setError(e?.message || 'Publish failed.');
    } finally {
      setBusyTrailId(null);
    }
  }

  function confirmDeleteTrail() {
    if (!deleteTarget) return;
    if (!canDeleteTrail(deleteTarget)) {
      setError('Minted trails cannot be deleted.');
      setDeleteTarget(null);
      return;
    }
    setTrails(c => c.filter(t => t.id !== deleteTarget.id));
    setSelectedTrailId(c => (c === deleteTarget.id ? null : c) as string | null);
    setNotice('Trail deleted.');
    setDeleteTarget(null);
  }

  /* ── Tabs ── */
  const editorTabs = [
    { id: 'details', label: 'Details' },
    { id: 'checkpoints', label: `Checkpoints (${selectedTrail?.points.length ?? 0})` },
    { id: 'pois', label: `POIs (${selectedTrail?.pois.length ?? 0})` },
    { id: 'nearby', label: `Nearby (${nearbyPois.length})` },
  ] as const;

  /* ──────────────────────────────────────────
     RENDER
  ────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Trail Lab — Admin
          </span>
          <h2 className="mt-1 text-2xl font-black text-gray-900">Full Trails Editor</h2>
          <p className="text-sm text-gray-400 mt-0.5">Create, import, edit, publish, and mint trails. Map editor with checkpoints, POIs, and detours.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCreateTrail}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-600 transition-colors">
            + New trail
          </button>
          <label className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-emerald-100 transition-colors">
            {importing ? 'Importing…' : 'Import file'}
            <input type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={handleImportFile} />
          </label>
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  pos => { setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }); setNotice('GPS refreshed.'); },
                  () => setError('GPS unavailable.'),
                  { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
                );
              }
            }}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            📍 Refresh GPS
          </button>
        </div>
      </div>

      {/* Runner search */}
      <div className="flex gap-2">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setRunnerSearch(searchInput.trim()); loadTrails(searchInput.trim() || undefined); } }}
          placeholder="Search by runner username… (Enter to load)"
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button
          onClick={() => { setRunnerSearch(searchInput.trim()); loadTrails(searchInput.trim() || undefined); }}
          className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-600 transition-colors">
          {loading ? '…' : 'Load'}
        </button>
        <button
          onClick={() => { setSearchInput(''); setRunnerSearch(''); loadTrails(); }}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
          Mine
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Trails" value={String(trails.length)} note={runnerSearch ? `@${runnerSearch}` : 'Your trails'} />
        <StatCard label="Total views" value={String(totalViews)} />
        <StatCard label="Reputation" value={String(totalReputation)} />
        <StatCard label="Formats" value={String(SUPPORTED_IMPORT_FORMATS.length)} note="Supported import formats" />
      </div>

      {/* Notice / error */}
      {(notice || error) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          <div className="flex items-center justify-between">
            <span>{error || notice}</span>
            <button onClick={() => { setError(null); setNotice(null); }} className="ml-4 text-current opacity-60 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 text-lg">Delete trail?</h3>
            <p className="text-sm text-gray-500 mt-2">
              "<strong>{deleteTarget.name}</strong>" will be permanently removed from the studio.
              {deleteTarget.publishedRouteId && ' The published route in the API will not be affected.'}
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={confirmDeleteTrail}
                className="flex-1 rounded-xl bg-red-500 text-white font-semibold py-2 text-sm hover:bg-red-600 transition-colors">
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 text-gray-600 font-semibold py-2 text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout: trail list + editor */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">

        {/* Trail list */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {loading ? 'Loading trails…' : `${trails.length} trail${trails.length !== 1 ? 's' : ''}`}
          </p>
          {loading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-400 text-sm">
              Loading…
            </div>
          ) : trails.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-400 text-sm">
              No trails found. Create a new draft or import a file.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
              {trails.map(trail => (
                <TrailCard
                  key={trail.id}
                  trail={trail}
                  selected={trail.id === selectedTrailId}
                  busy={busyTrailId === trail.id}
                  onEdit={() => {
                    setSelectedTrailId(trail.id);
                    setSelectedCheckpointIndex(null);
                    setSelectedPoiId(null);
                    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  onPublish={() => handlePublishTrail(trail)}
                  onMint={() => handlePublishTrail(trail, true)}
                  onDelete={() => setDeleteTarget(trail)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Editor column */}
        <div ref={editorRef} className="space-y-5">
          {!selectedTrail ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-400">
              Select a trail from the list to open the editor.
            </div>
          ) : (
            <>
              {/* Trail header */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{selectedTrail.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Owner: <strong>{selectedTrail.ownerName}</strong>
                    {selectedTrail.distanceKm > 0 && ` · ${selectedTrail.distanceKm.toFixed(2)} km`}
                    {selectedTrail.publishedRouteId && ` · Route ID: ${selectedTrail.publishedRouteId}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!selectedTrail.published && (
                    <button onClick={() => handlePublishTrail(selectedTrail)} disabled={!!busyTrailId}
                      className="rounded-xl bg-emerald-500 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50">
                      Publish
                    </button>
                  )}
                  {!selectedTrail.minted && (
                    <button onClick={() => handlePublishTrail(selectedTrail, true)} disabled={!!busyTrailId}
                      className="rounded-xl bg-amber-500 text-white px-4 py-2 text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50">
                      Mint & lock
                    </button>
                  )}
                  {canDeleteTrail(selectedTrail) && (
                    <button onClick={() => setDeleteTarget(selectedTrail)}
                      className="rounded-xl border border-red-200 text-red-500 px-4 py-2 text-sm font-semibold hover:bg-red-50 transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Map editor */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">OSM Map Editor</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {([
                        { key: 'select', label: '↖ Select' },
                        { key: 'checkpoint', label: '+ Checkpoint' },
                        { key: 'detour', label: '⤷ Detour' },
                      ] as const).map(m => (
                        <button key={m.key} onClick={() => setMapEditorMode(m.key)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mapEditorMode === m.key ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {m.label}
                        </button>
                      ))}
                      <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        {selectedTrail.points.length} pts · {totalPoiRewards} POI pts
                      </span>
                    </div>
                  </div>
                </div>
                <div className="h-[480px]">
                  <TrailMapEditor
                    trail={selectedTrail}
                    canEdit={true}
                    mode={mapEditorMode}
                    selectedCheckpointIndex={selectedCheckpointIndex}
                    selectedPoiId={selectedPoiId}
                    onSelectCheckpoint={setSelectedCheckpointIndex}
                    onSelectPoi={setSelectedPoiId}
                    onAddCheckpoint={handleMapAddCheckpoint}
                    onAddDetour={handleMapAddDetour}
                    onAddPoiAtLine={handleMapAddPoiAtLine}
                    onUpdateCheckpoint={handleMapCheckpointUpdate}
                    onUpdatePoi={handleMapPoiUpdate}
                  />
                </div>
              </div>

              {/* Tabbed editor panels */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-100">
                  {editorTabs.map(tab => (
                    <button key={tab.id} onClick={() => setEditorTab(tab.id)}
                      className={`flex-1 py-3 text-xs font-semibold transition ${editorTab === tab.id ? 'border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50/50' : 'text-gray-400 hover:text-gray-600'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {/* Details tab */}
                  {editorTab === 'details' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Trail name">
                        <input value={selectedTrail.name}
                          onChange={e => handleTrailField('name', e.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </Field>
                      <Field label="Region">
                        <input value={selectedTrail.region}
                          onChange={e => handleTrailField('region', e.target.value)}
                          placeholder="e.g. Northern ridge"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </Field>
                      <Field label="Difficulty">
                        <select value={selectedTrail.difficulty}
                          onChange={e => handleTrailField('difficulty', e.target.value as TrailDraft['difficulty'])}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300">
                          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="Surface">
                        <input value={selectedTrail.surface}
                          onChange={e => handleTrailField('surface', e.target.value)}
                          placeholder="Singletrack, gravel, alpine…"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </Field>
                      <Field label="Duration (min)">
                        <input type="number" min={15} value={selectedTrail.durationMin}
                          onChange={e => handleTrailField('durationMin', Number(e.target.value) || 15)}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </Field>
                      <Field label="Source format">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                          {selectedTrail.sourceFormat || 'Manual draft'}
                        </div>
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Description">
                          <textarea rows={4} value={selectedTrail.description}
                            onChange={e => handleTrailField('description', e.target.value)}
                            placeholder="What makes this trail special, who it is for, and which detours are worth exploring."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </Field>
                      </div>
                      <div className="md:col-span-2 grid grid-cols-3 gap-3 pt-1">
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                          <p className="text-xs text-gray-400">Distance</p>
                          <p className="font-bold text-gray-900">{selectedTrail.distanceKm.toFixed(2)} km</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                          <p className="text-xs text-gray-400">Views</p>
                          <p className="font-bold text-gray-900">{selectedTrail.views}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                          <p className="text-xs text-gray-400">Reputation</p>
                          <p className="font-bold text-gray-900">{selectedTrail.reputation}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Checkpoints tab */}
                  {editorTab === 'checkpoints' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">
                        Drag rows to reorder. Click to select on the map. Remove with ✕.
                      </p>
                      {selectedTrail.points.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                          No checkpoints yet. Use "Add checkpoint" mode on the map or import a file.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                          {selectedTrail.points.map((pt, i) => (
                            <div key={`${pt.lat}-${pt.lon}-${i}`}
                              draggable
                              onDragStart={() => setDragCheckpointIndex(i)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={() => handleCheckpointDrop(i)}
                              onClick={() => { setSelectedCheckpointIndex(i); setSelectedPoiId(null); }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer border transition-all ${selectedCheckpointIndex === i ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-gray-50 hover:bg-white'}`}>
                              <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate">{pt.label || `Checkpoint ${i + 1}`}</p>
                                <p className="text-[10px] text-gray-400">{pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}{pt.ele != null ? ` · ${pt.ele.toFixed(0)} m` : ''}</p>
                              </div>
                              <button onClick={e => { e.stopPropagation(); handleRemoveCheckpoint(i); }}
                                className="text-gray-300 hover:text-red-500 transition-colors text-sm flex-shrink-0">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* POIs tab */}
                  {editorTab === 'pois' && (
                    <div className="space-y-4">
                      {/* Add POI form */}
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Add POI</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={poiForm.name} onChange={e => setPoiForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="POI name *"
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          <select value={poiForm.kind} onChange={e => setPoiForm(f => ({ ...f, kind: e.target.value as TrailPoi['kind'] }))}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300">
                            <option value="checkpoint">Checkpoint</option>
                            <option value="detour">Detour</option>
                            <option value="scenic">Scenic</option>
                            <option value="water">Water</option>
                            <option value="photo">Photo spot</option>
                          </select>
                          <input value={poiForm.note} onChange={e => setPoiForm(f => ({ ...f, note: e.target.value }))}
                            placeholder="Note / description"
                            className="col-span-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          {poiForm.kind === 'detour' ? (
                            <input value={poiForm.offsetMeters} onChange={e => setPoiForm(f => ({ ...f, offsetMeters: e.target.value }))}
                              placeholder="Offset meters (e.g. 180)"
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          ) : (
                            <>
                              <input value={poiForm.lat} onChange={e => setPoiForm(f => ({ ...f, lat: e.target.value }))}
                                placeholder={`Lat (or click map)`}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                              <input value={poiForm.lon} onChange={e => setPoiForm(f => ({ ...f, lon: e.target.value }))}
                                placeholder={`Lon (or click map)`}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                            </>
                          )}
                          <input value={poiForm.rewardPoints} onChange={e => setPoiForm(f => ({ ...f, rewardPoints: e.target.value }))}
                            placeholder="Reward points"
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                        </div>
                        <button onClick={handleAddPoi}
                          className="w-full rounded-lg bg-gray-900 text-white text-xs font-semibold py-2 hover:bg-emerald-600 transition-colors">
                          Add POI to trail
                        </button>
                        <p className="text-[10px] text-gray-400 text-center">
                          Or use "Add checkpoint" / "Add detour" map mode and click the connector line to place a POI directly.
                        </p>
                      </div>

                      {/* POI list */}
                      {selectedTrail.pois.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                          No POIs yet. Add them via the form above or click a map connector line.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {selectedTrail.pois.map(poi => {
                            const kindColor: Record<string, string> = {
                              checkpoint: 'bg-emerald-100 text-emerald-700',
                              detour: 'bg-amber-100 text-amber-700',
                              scenic: 'bg-purple-100 text-purple-700',
                              water: 'bg-sky-100 text-sky-700',
                              photo: 'bg-pink-100 text-pink-700',
                            };
                            return (
                              <div key={poi.id}
                                onClick={() => setSelectedPoiId(poi.id)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer border transition-all ${selectedPoiId === poi.id ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-gray-50 hover:bg-white'}`}>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${kindColor[poi.kind] || 'bg-gray-100 text-gray-600'}`}>
                                  {poi.kind}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{poi.name}</p>
                                  <p className="text-[10px] text-gray-400">{poi.lat.toFixed(5)}, {poi.lon.toFixed(5)}{poi.distanceFromTrailM != null ? ` · ${poi.distanceFromTrailM} m` : ''}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <input type="number" min={0} value={poi.rewardPoints ?? 0}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => handlePoiRewardChange(poi.id, Number(e.target.value))}
                                    className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                                  <span className="text-[10px] text-gray-400">pts</span>
                                  <button onClick={e => { e.stopPropagation(); handleRemovePoi(poi.id); }}
                                    className="text-gray-300 hover:text-red-500 transition-colors text-sm ml-1">✕</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nearby POIs tab */}
                  {editorTab === 'nearby' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">
                        Live POIs from the OnTrail database near your current GPS location.
                        Attach at least 2 to enable full route API sync.
                      </p>
                      {nearbyPois.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                          No nearby POIs found. Refresh your GPS lock and try again.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {nearbyPois.map(poi => {
                            const alreadyAttached = selectedTrail.pois.some(p => p.externalPoiId === poi.id);
                            return (
                              <div key={poi.id}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{poi.name}</p>
                                  {poi.description && <p className="text-[10px] text-gray-400 truncate">{poi.description}</p>}
                                  <p className="text-[10px] text-gray-400">{poi.latitude.toFixed(5)}, {poi.longitude.toFixed(5)}</p>
                                </div>
                                <button onClick={() => addNearbyPoi(poi)} disabled={alreadyAttached}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex-shrink-0 ${alreadyAttached ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white hover:bg-emerald-600'}`}>
                                  {alreadyAttached ? '✓ Attached' : 'Attach'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Supported formats info */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-emerald-800 mb-2">📁 Supported import formats ({SUPPORTED_IMPORT_FORMATS.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORTED_IMPORT_FORMATS.map(fmt => (
                    <span key={fmt} className="text-[10px] bg-white border border-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">{fmt}</span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
