import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import TrailMapEditor from '../components/TrailMapEditor';
import {
  SUPPORTED_IMPORT_FORMATS,
  calculateDistanceMeters,
  calculateTrailDistanceKm,
  canDeleteTrail,
  createDetourPoi,
  createSnapshotDataUri,
  createStarterTrail,
  createTrailId,
  defaultRewardPoints,
  insertTrailPoint,
  loadSharedPhotoQueue,
  loadTrailDrafts,
  metersFromTrail,
  moveTrailPoint,
  parseTrailImportFile,
  projectDetourPoi,
  saveSharedPhotoQueue,
  syncPoiConnections,
  saveTrailDrafts,
  type TrailDraft,
  type TrailPhotoSubmission,
  type TrailPoi,
} from '../lib/trailStudio';

const DIFFICULTIES: TrailDraft['difficulty'][] = ['easy', 'moderate', 'hard', 'expert'];
const IMPORT_ACCEPT = '.gpx,.kml,.kmz,.csv,.json,.geojson,.xml,.tcx,.crs,.fit,.pwx,.nmea,.ovl,.itn,.sdf,.trc,.rss,.txt,.xls,.xlsx,.bin';

type GeoState = {
  lat: number;
  lon: number;
  accuracy: number;
};

type NearbyPoi = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  rarity?: string | null;
};

function difficultyFromDistance(distanceKm: number): TrailDraft['difficulty'] {
  if (distanceKm >= 25) return 'expert';
  if (distanceKm >= 14) return 'hard';
  if (distanceKm >= 6) return 'moderate';
  return 'easy';
}

function normalizeTrail(trail: TrailDraft): TrailDraft {
  const syncedPois = syncPoiConnections(trail.points, trail.pois);
  return {
    ...trail,
    pois: syncedPois,
    distanceKm: trail.points.length > 1 ? calculateTrailDistanceKm(trail.points) : trail.distanceKm,
    updatedAt: new Date().toISOString(),
  };
}

function mapApiRouteToDraft(route: any, ownerKey: string, ownerName: string): TrailDraft {
  const completions = Number(route.completion_count) || 0;
  return {
    id: createTrailId(),
    ownerKey,
    ownerName: route.creator_username || ownerName,
    publishedRouteId: route.id,
    name: route.name || 'Untitled trail',
    description: route.description || 'Mobile trail synced from the route service and ready for richer storytelling.',
    difficulty: DIFFICULTIES.includes(route.difficulty) ? route.difficulty : 'moderate',
    surface: 'mixed terrain',
    region: [route.start_poi_name, route.end_poi_name].filter(Boolean).join(' → ') || 'OnTrail route network',
    durationMin: 60,
    distanceKm: Number(route.distance_km) || 0,
    views: Math.max(32, completions * 18),
    reputation: Math.max(24, completions * 12 + (route.is_minted ? 40 : 0)),
    published: true,
    minted: Boolean(route.is_minted),
    importedFrom: 'mobile sync',
    sourceFormat: route.build_mode === 'auto' ? 'OnTrail mobile GPS' : 'OnTrail mobile manual builder',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    points: [],
    pois: [],
    photoSubmissions: [],
  };
}

function mergeServerTrails(localTrails: TrailDraft[], remoteRoutes: any[], ownerKey: string, ownerName: string) {
  const merged = [...localTrails];

  remoteRoutes.forEach((route) => {
    const existingIndex = merged.findIndex((item) => item.publishedRouteId === route.id || item.name === route.name);
    if (existingIndex >= 0) {
      const current = merged[existingIndex];
      merged[existingIndex] = normalizeTrail({
        ...current,
        publishedRouteId: route.id,
        published: true,
        minted: current.minted || Boolean(route.is_minted),
        difficulty: DIFFICULTIES.includes(route.difficulty) ? route.difficulty : current.difficulty,
        distanceKm: Number(route.distance_km) || current.distanceKm,
        views: Math.max(current.views, (Number(route.completion_count) || 0) * 18),
        reputation: Math.max(current.reputation, (Number(route.completion_count) || 0) * 12 + (route.is_minted ? 40 : 0)),
        region: current.region || [route.start_poi_name, route.end_poi_name].filter(Boolean).join(' → '),
        sourceFormat: current.sourceFormat || (route.build_mode === 'auto' ? 'OnTrail mobile GPS' : 'OnTrail mobile manual builder'),
      });
    } else {
      merged.push(mapApiRouteToDraft(route, ownerKey, ownerName));
    }
  });

  return merged.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export default function RoutesPage() {
  const { isConnected, isAdmin, login, username, email } = useAuth();
  const [searchParams] = useSearchParams();
  const runnerParam = searchParams.get('runner')?.trim().toLowerCase() || '';
  const isPublicRunnerView = Boolean(runnerParam) && runnerParam !== (username || '').toLowerCase();
  const isOwnerView = !isPublicRunnerView;
  const ownerName = isPublicRunnerView ? runnerParam : (username || email?.split('@')[0] || 'Trail owner');
  const ownerKey = runnerParam || username || email || 'guest-trail-lab';

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [busyTrailId, setBusyTrailId] = useState<string | null>(null);
  const [trails, setTrails] = useState<TrailDraft[]>([]);
  const [nearbyPois, setNearbyPois] = useState<NearbyPoi[]>([]);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrailDraft | null>(null);
  const [photoQueue, setPhotoQueue] = useState<TrailPhotoSubmission[]>([]);
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState<number | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [mapEditorMode, setMapEditorMode] = useState<'select' | 'checkpoint' | 'detour'>('select');
  const [dragCheckpointIndex, setDragCheckpointIndex] = useState<number | null>(null);
  const [poiForm, setPoiForm] = useState({
    name: '',
    note: '',
    kind: 'checkpoint' as TrailPoi['kind'],
    offsetMeters: '180',
    rewardPoints: '10',
    lat: '',
    lon: '',
  });
  const [photoForm, setPhotoForm] = useState({
    title: '',
    note: '',
    targetPoiId: '',
    file: null as File | null,
  });

  const selectedTrail = useMemo(
    () => trails.find((trail) => trail.id === selectedTrailId) ?? trails[0] ?? null,
    [selectedTrailId, trails],
  );

  const totalViews = useMemo(
    () => trails.reduce((sum, trail) => sum + trail.views, 0),
    [trails],
  );

  const totalReputation = useMemo(
    () => trails.reduce((sum, trail) => sum + trail.reputation, 0),
    [trails],
  );

  const pendingQueue = useMemo(
    () => photoQueue.filter((item) => item.status === 'pending' && (isAdmin || item.trailId === selectedTrail?.id)),
    [isAdmin, photoQueue, selectedTrail?.id],
  );

  const totalPoiRewards = useMemo(
    () => selectedTrail?.pois.reduce((sum, poi) => sum + (poi.rewardPoints || 0), 0) ?? 0,
    [selectedTrail],
  );

  useEffect(() => {
    setPhotoQueue(loadSharedPhotoQueue());
  }, []);

  useEffect(() => {
    saveSharedPhotoQueue(photoQueue);
  }, [photoQueue]);

  useEffect(() => {
    if (!selectedTrail && trails.length) {
      setSelectedTrailId(trails[0].id);
    }
  }, [selectedTrail, trails]);

  useEffect(() => {
    setSelectedCheckpointIndex(null);
    setSelectedPoiId(null);
  }, [selectedTrailId]);

  useEffect(() => {
    const stored = loadTrailDrafts(ownerKey);
    if (stored.length) {
      setTrails(stored);
      setSelectedTrailId(stored[0].id);
    } else if (isOwnerView) {
      const starter = createStarterTrail(ownerKey, ownerName);
      setTrails([starter]);
      setSelectedTrailId(starter.id);
    }
  }, [isOwnerView, ownerKey, ownerName]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      setLoading(true);
      try {
        const remoteRoutes = isPublicRunnerView
          ? await api.getRoutesByRunner(runnerParam)
          : isConnected
            ? await api.getMyRoutes()
            : [];

        if (!active) return;

        setTrails((current) => {
          const base = current.length ? current : (isOwnerView ? [createStarterTrail(ownerKey, ownerName)] : []);
          const merged = remoteRoutes.length ? mergeServerTrails(base, remoteRoutes, ownerKey, ownerName) : base;
          saveTrailDrafts(ownerKey, merged);
          return merged;
        });
      } catch {
        if (active && !trails.length && isOwnerView) {
          const starter = createStarterTrail(ownerKey, ownerName);
          setTrails([starter]);
          setSelectedTrailId(starter.id);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    hydrate();
    return () => {
      active = false;
    };
  }, [isConnected, isOwnerView, isPublicRunnerView, ownerKey, ownerName, runnerParam, trails.length]);

  useEffect(() => {
    if (!trails.length) return;
    saveTrailDrafts(ownerKey, trails);
  }, [ownerKey, trails]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (!geo) return;
    api.getNearbyPois(geo.lat, geo.lon, 15)
      .then((items) => setNearbyPois(items || []))
      .catch(() => undefined);
  }, [geo]);

  function patchTrail(trailId: string, updater: (current: TrailDraft) => TrailDraft) {
    setTrails((current) => current.map((trail) => (
      trail.id === trailId ? normalizeTrail(updater(trail)) : trail
    )));
  }

  function handleMapAddCheckpoint(lat: number, lon: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    const insertionIndex = selectedCheckpointIndex ?? Math.max(0, selectedTrail.points.length - 1);
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      points: insertTrailPoint(current.points, insertionIndex, {
        lat,
        lon,
        label: `Checkpoint ${insertionIndex + 2}`,
        timestamp: new Date().toISOString(),
      }),
      reputation: current.reputation + 2,
    }));
    setSelectedCheckpointIndex(Math.max(0, insertionIndex + 1));
    setSelectedPoiId(null);
    setNotice('Checkpoint added from the map editor. Drag it to refine the route line.');
  }

  function handleMapAddDetour(lat: number, lon: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    const detour = createDetourPoi(
      selectedTrail.points,
      lat,
      lon,
      `Detour ${selectedTrail.pois.filter((poi) => poi.kind === 'detour').length + 1}`,
      'Branching scenic stop added from the OSM editor.',
    );

    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      pois: [...current.pois, detour],
      reputation: current.reputation + 5,
    }));
    setSelectedPoiId(detour.id);
    setSelectedCheckpointIndex(detour.anchorPointIndex ?? null);
    setNotice('Detour checkpoint added. It now branches from the nearest main checkpoint.');
  }

  function handleMapCheckpointUpdate(index: number, lat: number, lon: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      points: current.points.map((point, pointIndex) => (
        pointIndex === index ? { ...point, lat, lon } : point
      )),
    }));
    setSelectedCheckpointIndex(index);
    setSelectedPoiId(null);
    setNotice('Checkpoint moved and its nearest POI links were refreshed.');
  }

  function handleMapAddPoiAtLine(lat: number, lon: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    const nextName = poiForm.name.trim() || `POI ${selectedTrail.pois.length + 1}`;
    const kind = poiForm.kind === 'detour' ? 'scenic' : poiForm.kind;
    const poi: TrailPoi = {
      id: createTrailId('poi'),
      name: nextName,
      note: poiForm.note.trim() || 'Added directly from a connector line.',
      lat,
      lon,
      kind,
      rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(kind)),
      anchorPointIndex: selectedCheckpointIndex ?? 0,
      distanceFromTrailM: Math.round(metersFromTrail(selectedTrail.points, lat, lon)),
    };

    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      pois: [...current.pois, poi],
      reputation: current.reputation + 4,
    }));
    setSelectedPoiId(poi.id);
    setNotice('A new POI was added directly on the connector line.');
  }

  function handleMapPoiUpdate(poiId: string, lat: number, lon: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      pois: current.pois.map((poi) => (
        poi.id === poiId
          ? {
              ...poi,
              lat,
              lon,
              anchorPointIndex: poi.kind === 'detour' ? selectedCheckpointIndex ?? poi.anchorPointIndex : poi.anchorPointIndex,
              distanceFromTrailM: Math.round(metersFromTrail(current.points, lat, lon)),
            }
          : poi
      )),
    }));
  }

  function handlePoiRewardChange(poiId: string, rewardPoints: number) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      pois: current.pois.map((poi) => (
        poi.id === poiId ? { ...poi, rewardPoints: Math.max(0, rewardPoints) } : poi
      )),
    }));
  }

  function handleCheckpointDrop(targetIndex: number) {
    if (!selectedTrail || dragCheckpointIndex === null || dragCheckpointIndex === targetIndex) return;
    if (!requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      points: moveTrailPoint(current.points, dragCheckpointIndex, targetIndex),
    }));
    setSelectedCheckpointIndex(targetIndex);
    setDragCheckpointIndex(null);
    setNotice('Checkpoint order updated with drag and drop.');
  }

  function requireOwnerAccess() {
    if (!isOwnerView) {
      setError('Only the profile owner can edit, mint, or remove trails in this studio view.');
      return false;
    }
    if (!isConnected) {
      login();
      return false;
    }
    return true;
  }

  function handleCreateTrail() {
    if (!requireOwnerAccess()) return;
    const trail = createStarterTrail(ownerKey, ownerName);
    trail.id = createTrailId();
    trail.name = `${ownerName} trail draft ${trails.length + 1}`;
    trail.views = 0;
    trail.reputation = 0;
    setTrails((current) => [trail, ...current]);
    setSelectedTrailId(trail.id);
    setNotice('A fresh trail draft is ready for import, POIs, and publication.');
    setError(null);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!requireOwnerAccess()) {
      event.target.value = '';
      return;
    }

    setImporting(true);
    setError(null);
    setNotice(null);

    try {
      const parsed = await parseTrailImportFile(file);
      const base = selectedTrail ?? createStarterTrail(ownerKey, ownerName);
      const nextTrail = normalizeTrail({
        ...base,
        id: selectedTrail?.id ?? createTrailId(),
        name: parsed.name || base.name,
        description: base.description || `Imported from ${parsed.sourceFormat}. Add POIs, detours, and media before publishing.`,
        difficulty: difficultyFromDistance(parsed.distanceKm || base.distanceKm),
        durationMin: parsed.estimatedDurationMin || base.durationMin,
        importedFrom: file.name,
        sourceFormat: parsed.sourceFormat,
        points: parsed.points.length ? parsed.points : base.points,
        pois: [...base.pois, ...parsed.pois],
        published: false,
      });

      setTrails((current) => {
        const exists = current.some((trail) => trail.id === nextTrail.id);
        return exists ? current.map((trail) => (trail.id === nextTrail.id ? nextTrail : trail)) : [nextTrail, ...current];
      });
      setSelectedTrailId(nextTrail.id);
      setNotice(`Imported ${parsed.sourceFormat} with ${parsed.points.length} route points and ${parsed.pois.length} POIs.${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''}`);
    } catch (importError: any) {
      setError(importError?.message || 'Import failed. Try GPX, KML, TCX, CSV, JSON, or another supported trail export.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  function handleTrailFieldChange<K extends keyof TrailDraft>(field: K, value: TrailDraft[K]) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => ({ ...current, [field]: value }));
  }

  function addNearbyPoi(poi: NearbyPoi) {
    if (!selectedTrail || !requireOwnerAccess()) return;
    patchTrail(selectedTrail.id, (current) => {
      if (current.pois.some((item) => item.externalPoiId === poi.id)) return current;
      return {
        ...current,
        pois: [
          ...current.pois,
          {
            id: createTrailId('poi'),
            name: poi.name,
            note: poi.description || 'Nearby live POI linked for route publishing.',
            lat: poi.latitude,
            lon: poi.longitude,
            kind: 'checkpoint',
            externalPoiId: poi.id,
            distanceFromTrailM: Math.round(metersFromTrail(current.points, poi.latitude, poi.longitude)),
            rewardPoints: defaultRewardPoints('checkpoint'),
            anchorPointIndex: current.points.length ? 0 : undefined,
          },
        ],
      };
    });
    setNotice('Live POI attached. This trail is now closer to being publish-ready on the shared route API.');
  }

  function handleAddPoi() {
    if (!selectedTrail || !requireOwnerAccess()) return;
    if (!poiForm.name.trim()) {
      setError('Name the POI before adding it to the trail.');
      return;
    }

    const fallbackPoint = selectedTrail.points[Math.floor(selectedTrail.points.length / 2)] || {
      lat: geo?.lat ?? 59.3293,
      lon: geo?.lon ?? 18.0686,
    };

    const poi = poiForm.kind === 'detour'
      ? {
          ...projectDetourPoi(selectedTrail.points, Math.max(60, Number(poiForm.offsetMeters) || 180), poiForm.name.trim(), poiForm.note.trim()),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints('detour')),
        }
      : {
          id: createTrailId('poi'),
          name: poiForm.name.trim(),
          note: poiForm.note.trim(),
          lat: Number(poiForm.lat) || geo?.lat || fallbackPoint.lat,
          lon: Number(poiForm.lon) || geo?.lon || fallbackPoint.lon,
          kind: poiForm.kind,
          distanceFromTrailM: Math.round(metersFromTrail(selectedTrail.points, Number(poiForm.lat) || geo?.lat || fallbackPoint.lat, Number(poiForm.lon) || geo?.lon || fallbackPoint.lon)),
          rewardPoints: Math.max(0, Number(poiForm.rewardPoints) || defaultRewardPoints(poiForm.kind)),
          anchorPointIndex: selectedCheckpointIndex ?? 0,
        } as TrailPoi;

    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      pois: [...current.pois, poi],
      reputation: current.reputation + (poi.kind === 'detour' ? 6 : 4),
    }));

    setPoiForm({ name: '', note: '', kind: 'checkpoint', offsetMeters: '180', rewardPoints: '10', lat: '', lon: '' });
    setNotice(poi.kind === 'detour' ? 'Detour POI added. The trail now highlights an off-route scenic stop.' : 'POI added to the selected trail.');
    setError(null);
  }

  async function handlePublishTrail(trail: TrailDraft, mintNow = false) {
    if (!requireOwnerAccess()) return;
    setBusyTrailId(trail.id);
    setError(null);

    try {
      if (trail.publishedRouteId) {
        patchTrail(trail.id, (current) => ({
          ...current,
          published: true,
          minted: mintNow ? true : current.minted,
          views: current.views + (mintNow ? 16 : 8),
          reputation: current.reputation + (mintNow ? 14 : 8),
        }));
        setNotice(mintNow ? 'Trail marked as minted in the studio and locked from deletion.' : 'Trail is already published and visible in the gallery.');
        return;
      }

      const livePoiIds = trail.pois.map((poi) => poi.externalPoiId).filter(Boolean);
      if (livePoiIds.length >= 2 && isConnected) {
        const route = await api.createRoute({
          name: trail.name,
          description: trail.description,
          difficulty: trail.difficulty,
          estimated_duration_min: trail.durationMin,
          poi_ids: livePoiIds,
          build_mode: trail.importedFrom ? 'auto' : 'manual',
          is_loop: false,
          is_minted: mintNow || trail.minted,
          route_points: trail.points.map((point, index) => ({
            latitude: point.lat,
            longitude: point.lon,
            altitude: point.ele ?? null,
            label: point.label || `Point ${index + 1}`,
            timestamp: point.timestamp || new Date().toISOString(),
          })),
          checkpoints: trail.pois.map((poi, index) => ({
            id: poi.externalPoiId || poi.id,
            name: poi.name,
            latitude: poi.lat,
            longitude: poi.lon,
            position: index,
            kind: poi.kind,
          })),
        });

        patchTrail(trail.id, (current) => ({
          ...current,
          publishedRouteId: route.id,
          published: true,
          minted: mintNow || current.minted,
          distanceKm: Number(route.distance_km) || current.distanceKm,
          views: current.views + 24,
          reputation: current.reputation + (mintNow ? 20 : 10),
        }));
        setNotice(mintNow ? 'Trail published and locked as a minted release.' : 'Trail published to OnTrail and ready for discovery.');
      } else {
        patchTrail(trail.id, (current) => ({
          ...current,
          published: true,
          minted: mintNow || current.minted,
          views: current.views + 10,
          reputation: current.reputation + (mintNow ? 16 : 8),
        }));
        setNotice(mintNow
          ? 'Trail minted in studio mode and protected from deletion. Attach at least two live POIs when you want a full route API sync.'
          : 'Trail published in studio draft mode. Attach at least two live POIs to sync it with the route API.');
      }
    } catch (publishError: any) {
      setError(publishError?.message || 'Publishing failed. Attach at least two valid nearby POIs and try again.');
    } finally {
      setBusyTrailId(null);
    }
  }

  async function handleMintTrail(trail: TrailDraft) {
    if (trail.minted) {
      setNotice('This trail is already minted and permanently protected from deletion.');
      return;
    }
    await handlePublishTrail(trail, true);
  }

  function handleDeleteRequest(trail: TrailDraft) {
    setDeleteTarget(trail);
  }

  function confirmDeleteTrail() {
    if (!deleteTarget) return;
    if (!canDeleteTrail(deleteTarget)) {
      setError('Minted trails are permanent and cannot be deleted.');
      setDeleteTarget(null);
      return;
    }

    setTrails((current) => current.filter((trail) => trail.id !== deleteTarget.id));
    setPhotoQueue((current) => current.filter((item) => item.trailId !== deleteTarget.id));
    setSelectedTrailId((current) => (current === deleteTarget.id ? null : current));
    setNotice('Trail removed from the studio draft gallery.');
    setDeleteTarget(null);
  }

  function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setPhotoForm((current) => ({ ...current, file }));
  }

  function refreshGpsLock() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('This browser does not expose live GPS, so photo validation cannot run here.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
        });
        setNotice('Live GPS refreshed for trail photo validation.');
      },
      () => setError('Unable to read your current location. Grant location access and try again.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  }

  function submitPhotoContribution() {
    if (!selectedTrail) {
      setError('Select a trail before submitting a contribution photo.');
      return;
    }
    if (!isConnected) {
      login();
      return;
    }
    if (!photoForm.file) {
      setError('Choose an image to submit to the validation queue.');
      return;
    }
    if (!geo) {
      setError('A live GPS lock is required before trail photos can be submitted.');
      return;
    }

    const targetPoi = selectedTrail.pois.find((poi) => poi.id === photoForm.targetPoiId);
    const trailDistance = metersFromTrail(selectedTrail.points, geo.lat, geo.lon);
    const poiDistance = targetPoi ? calculateDistanceMeters({ lat: geo.lat, lon: geo.lon }, { lat: targetPoi.lat, lon: targetPoi.lon }) : Number.POSITIVE_INFINITY;
    const effectiveDistance = Math.min(trailDistance, poiDistance);
    const threshold = targetPoi?.kind === 'detour' ? 220 : 150;

    if (!Number.isFinite(effectiveDistance) || effectiveDistance > threshold) {
      setError(`You need to be within ${threshold} m of the trail or chosen POI. Current distance is ${Math.round(effectiveDistance || trailDistance)} m.`);
      return;
    }

    const submission: TrailPhotoSubmission = {
      id: createTrailId('photo'),
      trailId: selectedTrail.id,
      trailName: selectedTrail.name,
      contributor: username || email || 'Community runner',
      title: photoForm.title.trim() || photoForm.file.name,
      note: photoForm.note.trim(),
      lat: geo.lat,
      lon: geo.lon,
      accuracyM: Math.round(geo.accuracy),
      distanceFromTrailM: Math.round(effectiveDistance),
      fileName: photoForm.file.name,
      mimeType: photoForm.file.type || 'image/jpeg',
      sizeBytes: photoForm.file.size,
      submittedAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      status: 'pending',
      previewUrl: URL.createObjectURL(photoForm.file),
      targetPoiName: targetPoi?.name,
      device: typeof navigator !== 'undefined' ? navigator.userAgent : 'Browser upload',
    };

    setPhotoQueue((current) => [submission, ...current]);
    patchTrail(selectedTrail.id, (current) => ({
      ...current,
      photoSubmissions: [submission, ...current.photoSubmissions],
      views: current.views + 4,
      reputation: current.reputation + 2,
    }));
    setPhotoForm({ title: '', note: '', targetPoiId: '', file: null });
    setNotice('Photo contribution validated by live GPS and sent for owner review.');
    setError(null);
  }

  function reviewSubmission(submissionId: string, status: 'approved' | 'rejected') {
    const reviewer = username || email || 'Trail owner';
    setPhotoQueue((current) => current.map((item) => (
      item.id === submissionId ? { ...item, status, reviewer } : item
    )));
    setTrails((current) => current.map((trail) => ({
      ...trail,
      photoSubmissions: trail.photoSubmissions.map((item) => (
        item.id === submissionId ? { ...item, status, reviewer } : item
      )),
    })));
    setNotice(status === 'approved' ? 'Photo approved and now boosts the trail story.' : 'Photo rejected and removed from the public approval path.');
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-gradient-to-br from-white via-emerald-50/70 to-cyan-50/80 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.18),transparent_34%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <span className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Trail Lab
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
              Edit, enrich, publish, and mint mobile-built trails.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Import route files, add scenic POIs and detours, surface views and reputation, and moderate GPS-validated community photos in one studio.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={handleCreateTrail} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-600">
                New trail draft
              </button>
              <button onClick={refreshGpsLock} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white">
                Refresh GPS lock
              </button>
              <label className="cursor-pointer rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
                {importing ? 'Importing…' : 'Import trail file'}
                <input type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={handleImportFile} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Trails" value={String(trails.length)} note={isPublicRunnerView ? `${ownerName} gallery` : 'Owner studio'} />
            <StatCard label="Views" value={String(totalViews)} note="Discovery and reach" />
            <StatCard label="Reputation" value={String(totalReputation)} note="Quality signal" />
          </div>
        </div>
      </section>

      {(notice || error) && (
        <div className={`rounded-[24px] border px-4 py-3 text-sm backdrop-blur-xl ${error ? 'border-rose-200 bg-rose-50/90 text-rose-700' : 'border-emerald-200 bg-emerald-50/90 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <GlassPanel
        title={isPublicRunnerView ? `${ownerName}'s trail gallery` : 'Trail gallery'}
        eyebrow="Bento grid spotlight cards"
        action={
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-white/80 px-3 py-1">Views + reputation visible</span>
            <span className="rounded-full bg-white/80 px-3 py-1">Minted trails are permanent</span>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-slate-500">
            Loading the trail gallery…
          </div>
        ) : trails.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-slate-500">
            No trails yet. Start by importing a GPX, KML, CSV, or mobile route export.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {trails.map((trail, index) => (
              <TrailGalleryCard
                key={trail.id}
                trail={trail}
                spotlight={index % 3 === 0}
                selected={trail.id === selectedTrail?.id}
                canManage={isOwnerView && isConnected}
                busy={busyTrailId === trail.id}
                onEdit={() => {
                  setSelectedTrailId(trail.id);
                  document.getElementById('trail-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                onPublish={() => handlePublishTrail(trail)}
                onMint={() => handleMintTrail(trail)}
                onDelete={() => handleDeleteRequest(trail)}
              />
            ))}
          </div>
        )}
      </GlassPanel>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6" id="trail-editor">
          <GlassPanel title="Trail studio editor" eyebrow="Owner workspace">
            {selectedTrail ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Trail name">
                  <input
                    value={selectedTrail.name}
                    onChange={(event) => handleTrailFieldChange('name', event.target.value)}
                    disabled={!isOwnerView}
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                    placeholder="Blue summit loop"
                  />
                </Field>
                <Field label="Region">
                  <input
                    value={selectedTrail.region}
                    onChange={(event) => handleTrailFieldChange('region', event.target.value)}
                    disabled={!isOwnerView}
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                    placeholder="Northern ridge"
                  />
                </Field>
                <Field label="Difficulty">
                  <select
                    value={selectedTrail.difficulty}
                    onChange={(event) => handleTrailFieldChange('difficulty', event.target.value as TrailDraft['difficulty'])}
                    disabled={!isOwnerView}
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                  >
                    {DIFFICULTIES.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>{difficulty}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Surface">
                  <input
                    value={selectedTrail.surface}
                    onChange={(event) => handleTrailFieldChange('surface', event.target.value)}
                    disabled={!isOwnerView}
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                    placeholder="Singletrack, gravel, alpine"
                  />
                </Field>
                <Field label="Duration">
                  <input
                    type="number"
                    min={15}
                    value={selectedTrail.durationMin}
                    onChange={(event) => handleTrailFieldChange('durationMin', Number(event.target.value) || 15)}
                    disabled={!isOwnerView}
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                  />
                </Field>
                <Field label="Source">
                  <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-700">
                    {selectedTrail.sourceFormat || 'Manual draft'}
                  </div>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea
                      rows={4}
                      value={selectedTrail.description}
                      onChange={(event) => handleTrailFieldChange('description', event.target.value)}
                      disabled={!isOwnerView}
                      className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300"
                      placeholder="What makes this trail special, who it is for, and which detours are worth the extra meters."
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a trail card to open the editor.</p>
            )}
          </GlassPanel>

          <GlassPanel title="OSM trail map editor" eyebrow="Click, drag, and refine">
            {selectedTrail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'select', label: 'Select / drag' },
                    { key: 'checkpoint', label: 'Add checkpoint' },
                    { key: 'detour', label: 'Add detour branch' },
                  ].map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setMapEditorMode(entry.key as 'select' | 'checkpoint' | 'detour')}
                      className={`rounded-2xl px-3.5 py-2 text-sm font-semibold transition ${mapEditorMode === entry.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50'}`}
                    >
                      {entry.label}
                    </button>
                  ))}
                  <span className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                    {selectedTrail.points.length} checkpoints • {totalPoiRewards} POI pts
                  </span>
                </div>

                <TrailMapEditor
                  trail={selectedTrail}
                  canEdit={isOwnerView && isConnected}
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

                <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Checkpoint drag list</p>
                    <div className="space-y-2">
                      {selectedTrail.points.map((point, index) => (
                        <button
                          key={`${point.lat}-${point.lon}-${index}`}
                          type="button"
                          draggable={isOwnerView && isConnected}
                          onDragStart={() => setDragCheckpointIndex(index)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleCheckpointDrop(index)}
                          onClick={() => {
                            setSelectedCheckpointIndex(index);
                            setSelectedPoiId(null);
                          }}
                          className={`flex w-full items-center justify-between rounded-[20px] border px-3 py-2 text-left transition ${selectedCheckpointIndex === index ? 'border-emerald-300 bg-emerald-50/90' : 'border-slate-200 bg-white/80 hover:bg-slate-50'}`}
                        >
                          <span>
                            <span className="block text-sm font-semibold text-slate-900">{point.label || `Checkpoint ${index + 1}`}</span>
                            <span className="block text-xs text-slate-500">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</span>
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">drag</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected editor focus</p>
                    {selectedPoiId ? (
                      (() => {
                        const poi = selectedTrail.pois.find((entry) => entry.id === selectedPoiId);
                        if (!poi) return <p className="mt-3 text-sm text-slate-500">Select a POI on the map to edit it.</p>;
                        return (
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">{poi.name}</p>
                            <p>{poi.kind} • {poi.rewardPoints || 0} pts</p>
                            <p>{poi.lat.toFixed(5)}, {poi.lon.toFixed(5)}</p>
                            <p>{poi.note || 'No note yet'}</p>
                          </div>
                        );
                      })()
                    ) : selectedCheckpointIndex !== null ? (
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Checkpoint {selectedCheckpointIndex + 1}</p>
                        <p>Click the map in checkpoint mode to insert a new point after this one.</p>
                        <p>Drag the marker directly on the OSM map to refine the trail geometry.</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Click a checkpoint or POI on the map to focus and edit it.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a trail to start editing it on the map.</p>
            )}
          </GlassPanel>

          <GlassPanel title="POI and detour builder" eyebrow="Value-adding route enrichment">
            {selectedTrail ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="POI name">
                    <input value={poiForm.name} onChange={(event) => setPoiForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Summit lookout" />
                  </Field>
                  <Field label="Kind">
                    <select value={poiForm.kind} onChange={(event) => setPoiForm((current) => ({ ...current, kind: event.target.value as TrailPoi['kind'], rewardPoints: String(defaultRewardPoints(event.target.value as TrailPoi['kind'])) }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300">
                      <option value="checkpoint">Checkpoint</option>
                      <option value="scenic">Scenic</option>
                      <option value="water">Water</option>
                      <option value="detour">Detour POI</option>
                    </select>
                  </Field>
                  <Field label="POI points">
                    <input value={poiForm.rewardPoints} onChange={(event) => setPoiForm((current) => ({ ...current, rewardPoints: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="25" />
                  </Field>
                  <Field label="Latitude">
                    <input value={poiForm.lat} onChange={(event) => setPoiForm((current) => ({ ...current, lat: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Optional manual coordinate" />
                  </Field>
                  <Field label="Longitude">
                    <input value={poiForm.lon} onChange={(event) => setPoiForm((current) => ({ ...current, lon: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Optional manual coordinate" />
                  </Field>
                  <Field label="Detour offset meters">
                    <input value={poiForm.offsetMeters} onChange={(event) => setPoiForm((current) => ({ ...current, offsetMeters: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="180" />
                  </Field>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Field label="Note">
                      <input value={poiForm.note} onChange={(event) => setPoiForm((current) => ({ ...current, note: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Water source, lookout, stairs" />
                    </Field>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleAddPoi} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600">Add POI</button>
                  <span className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                    Add scenic detours, tune reward points, and gamify the route stop by stop.
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {selectedTrail.pois.map((poi) => (
                    <div key={poi.id} className={`rounded-[22px] border bg-white/80 p-4 ${selectedPoiId === poi.id ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <button type="button" onClick={() => { setSelectedPoiId(poi.id); setSelectedCheckpointIndex(poi.anchorPointIndex ?? null); }} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-700">{poi.name}</button>
                          <p className="mt-1 text-xs text-slate-500">{poi.note || 'Trail enrichment point'}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${poi.kind === 'detour' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {poi.kind}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        {poi.lat.toFixed(5)}, {poi.lon.toFixed(5)}
                        {typeof poi.distanceFromTrailM === 'number' ? ` • ${poi.distanceFromTrailM} m from trail` : ''}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Reward</span>
                        <input
                          type="number"
                          min={0}
                          value={poi.rewardPoints || 0}
                          onChange={(event) => handlePoiRewardChange(poi.id, Number(event.target.value) || 0)}
                          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                        />
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">pts</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Attach nearby live POIs for publish sync</p>
                  <div className="flex flex-wrap gap-2">
                    {nearbyPois.slice(0, 10).map((poi) => (
                      <button key={poi.id} onClick={() => addNearbyPoi(poi)} className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50">
                        + {poi.name}
                      </button>
                    ))}
                    {nearbyPois.length === 0 && <span className="text-xs text-slate-500">Move closer to a mapped area or refresh GPS to surface nearby POIs.</span>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Choose a trail to begin adding checkpoints and detours.</p>
            )}
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel title="Import support" eyebrow="Multi-format trail ingestion">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between rounded-[22px] border border-dashed border-emerald-300 bg-emerald-50/70 p-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
                <span>{importing ? 'Import in progress…' : 'Choose trail file'}</span>
                <input type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={handleImportFile} />
              </label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_IMPORT_FORMATS.map((format) => (
                  <span key={format} className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {format}
                  </span>
                ))}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel title="Community photo contribution" eyebrow="GPS-validated uploads">
            {selectedTrail ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Contributors must be physically near the trail or the chosen detour POI before a photo can enter the validation queue.
                </p>
                <Field label="Photo title">
                  <input value={photoForm.title} onChange={(event) => setPhotoForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Summit sunrise" />
                </Field>
                <Field label="Target POI">
                  <select value={photoForm.targetPoiId} onChange={(event) => setPhotoForm((current) => ({ ...current, targetPoiId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300">
                    <option value="">Nearest trail segment</option>
                    {selectedTrail.pois.map((poi) => (
                      <option key={poi.id} value={poi.id}>{poi.name} · {poi.kind}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Note for reviewer">
                  <textarea rows={3} value={photoForm.note} onChange={(event) => setPhotoForm((current) => ({ ...current, note: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300" placeholder="Why this photo adds value to the trail page" />
                </Field>
                <label className="flex cursor-pointer items-center justify-between rounded-[22px] border border-slate-200 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700">
                  <span>{photoForm.file?.name || 'Choose image'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoFileChange} />
                </label>
                <div className="rounded-[20px] border border-slate-200 bg-white/75 p-3 text-xs text-slate-600">
                  GPS lock: {geo ? `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)} • ±${Math.round(geo.accuracy)} m` : 'Not yet available'}
                </div>
                <button onClick={submitPhotoContribution} className="w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600">
                  Submit photo for validation
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a trail to contribute a location-validated photo.</p>
            )}
          </GlassPanel>

          <GlassPanel title="Validation queue" eyebrow="Owner and admin review">
            <div className="space-y-3">
              {pendingQueue.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/75 p-4 text-sm text-slate-500">
                  No pending photos right now.
                </div>
              ) : (
                pendingQueue.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white/85 p-4">
                    <div className="flex items-start gap-3">
                      {item.previewUrl && <img src={item.previewUrl} alt={item.title} className="h-20 w-20 rounded-2xl object-cover" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500">{item.contributor} • {item.trailName}</p>
                          </div>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">pending</span>
                        </div>
                        <div className="mt-2 grid gap-1 text-[11px] text-slate-500">
                          <span>File: {item.fileName} • {item.mimeType} • {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                          <span>GPS: {item.lat.toFixed(5)}, {item.lon.toFixed(5)} • ±{item.accuracyM} m</span>
                          <span>Distance to trail: {item.distanceFromTrailM} m{item.targetPoiName ? ` • Target POI: ${item.targetPoiName}` : ''}</span>
                          <span>Captured: {new Date(item.capturedAt).toLocaleString()}</span>
                          <span className="truncate">Device: {item.device || 'Unknown browser'}</span>
                        </div>
                      </div>
                    </div>
                    {(isOwnerView || isAdmin) && (
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => reviewSubmission(item.id, 'approved')} className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        <button onClick={() => reviewSubmission(item.id, 'rejected')} className="rounded-2xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white">Reject</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </GlassPanel>
        </div>
      </div>

      <WarningModal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.minted ? 'Minted trail cannot be deleted' : 'Delete trail draft?'}
        body={deleteTarget?.minted
          ? 'This trail is already minted, which means it is permanent in the studio flow and protected from removal. You can still edit the story, POIs, and validation settings, but deletion stays disabled.'
          : 'Deleting a trail removes its imported path, custom POIs, detour data, and pending community photo submissions. This is a destructive action and should only be used for non-minted drafts.'}
        confirmLabel={deleteTarget?.minted ? 'Understood' : 'Delete draft'}
        destructive={!deleteTarget?.minted}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.minted) {
            setDeleteTarget(null);
            return;
          }
          confirmDeleteTrail();
        }}
      />
    </div>
  );
}

function GlassPanel({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/70 bg-white/70 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">{eyebrow}</p>}
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function TrailGalleryCard({
  trail,
  selected,
  spotlight,
  canManage,
  busy,
  onEdit,
  onPublish,
  onMint,
  onDelete,
}: {
  trail: TrailDraft;
  selected: boolean;
  spotlight?: boolean;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onMint: () => void;
  onDelete: () => void;
}) {
  const snapshot = createSnapshotDataUri(trail.points, trail.name);

  return (
    <article className={`group relative overflow-hidden rounded-[30px] border p-4 text-white shadow-[0_30px_70px_rgba(15,23,42,0.18)] ${selected ? 'border-emerald-300 ring-2 ring-emerald-200' : 'border-slate-900/10'}`}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${snapshot})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_34%)] opacity-0 transition group-hover:opacity-100" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/20 via-slate-900/45 to-slate-950/85" />

      <div className="relative flex h-full flex-col justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">{trail.difficulty}</span>
            {trail.minted && <span className="rounded-full bg-amber-300/20 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Minted</span>}
            {trail.published && <span className="rounded-full bg-emerald-300/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">Published</span>}
            {spotlight && <span className="rounded-full bg-sky-300/20 px-2.5 py-1 text-[11px] font-semibold text-sky-100">Spotlight</span>}
          </div>
          <h3 className="mt-3 text-xl font-black">{trail.name}</h3>
          <p className="mt-2 text-sm text-white/80">{trail.description}</p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs text-white/85">
            <div className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-xl">
              <div className="font-semibold">{trail.distanceKm.toFixed(1)} km</div>
              <div className="text-white/70">distance</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-xl">
              <div className="font-semibold">{trail.views}</div>
              <div className="text-white/70">views</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-xl">
              <div className="font-semibold">{trail.reputation}</div>
              <div className="text-white/70">reputation</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-xl">
              <div className="font-semibold">{trail.pois.length}</div>
              <div className="text-white/70">POIs</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ActionPill onClick={onPublish} disabled={!canManage || busy}>{busy ? 'Working…' : 'Publish'}</ActionPill>
            <ActionPill onClick={onMint} disabled={!canManage || busy}>{trail.minted ? 'Minted' : 'Mint'}</ActionPill>
            <ActionPill onClick={onEdit}>Edit</ActionPill>
            <ActionPill onClick={onDelete} disabled={!canManage || trail.minted}>Delete</ActionPill>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionPill({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-2xl border border-white/20 bg-white/12 px-3 py-2 text-xs font-semibold text-white backdrop-blur-xl transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-55">
      {children}
    </button>
  );
}

function WarningModal({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-[30px] border border-white/60 bg-white/80 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_38%)] p-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-2xl">⚠️</div>
          <h3 className="text-2xl font-black text-slate-900">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/75 p-4 text-sm text-slate-600">
            <ul className="space-y-1">
              <li>• Imported path geometry and POI annotations can be lost</li>
              <li>• Pending community media submissions are removed with the draft</li>
              <li>• Minted trails stay immutable and cannot be deleted</li>
            </ul>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={onClose} className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
            <button onClick={onConfirm} className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white ${destructive ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
