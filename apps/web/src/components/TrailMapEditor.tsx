import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { nearestTrailPointIndex, type TrailDraft } from '../lib/trailStudio';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const OSM_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

type EditorMode = 'select' | 'checkpoint' | 'detour';

type Props = {
  trail: TrailDraft | null;
  canEdit: boolean;
  mode: EditorMode;
  selectedCheckpointIndex: number | null;
  selectedPoiId: string | null;
  onSelectCheckpoint: (index: number | null) => void;
  onSelectPoi: (id: string | null) => void;
  onAddCheckpoint: (lat: number, lon: number) => void;
  onAddDetour: (lat: number, lon: number) => void;
  onAddPoiAtLine: (lat: number, lon: number) => void;
  onUpdateCheckpoint: (index: number, lat: number, lon: number) => void;
  onUpdatePoi: (id: string, lat: number, lon: number) => void;
};

async function canUseOpenFreeMap(): Promise<boolean> {
  try {
    const response = await fetch(OPEN_FREE_MAP_STYLE, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

function createCheckpointNode(index: number, selected: boolean) {
  const node = document.createElement('button');
  node.type = 'button';
  node.style.width = '30px';
  node.style.height = '30px';
  node.style.borderRadius = '999px';
  node.style.border = selected ? '3px solid rgba(16,185,129,0.95)' : '3px solid rgba(255,255,255,0.96)';
  node.style.background = selected ? '#d1fae5' : '#0f172a';
  node.style.color = selected ? '#065f46' : '#ffffff';
  node.style.fontSize = '11px';
  node.style.fontWeight = '800';
  node.style.boxShadow = '0 10px 24px rgba(15,23,42,0.22)';
  node.style.cursor = 'pointer';
  node.textContent = String(index + 1);
  return node;
}

function createPoiNode(kind: string, rewardPoints: number, selected: boolean) {
  const node = document.createElement('button');
  node.type = 'button';
  node.style.width = '34px';
  node.style.height = '34px';
  node.style.borderRadius = kind === 'detour' ? '10px' : '999px';
  node.style.border = selected ? '3px solid rgba(14,165,233,0.95)' : '3px solid rgba(255,255,255,0.96)';
  node.style.background = kind === 'detour' ? '#f59e0b' : kind === 'scenic' ? '#8b5cf6' : kind === 'water' ? '#0ea5e9' : '#10b981';
  node.style.color = '#ffffff';
  node.style.fontSize = '10px';
  node.style.fontWeight = '800';
  node.style.boxShadow = '0 10px 24px rgba(15,23,42,0.22)';
  node.style.cursor = 'pointer';
  node.textContent = String(rewardPoints || 0);
  return node;
}

export default function TrailMapEditor({
  trail,
  canEdit,
  mode,
  selectedCheckpointIndex,
  selectedPoiId,
  onSelectCheckpoint,
  onSelectPoi,
  onAddCheckpoint,
  onAddDetour,
  onAddPoiAtLine,
  onUpdateCheckpoint,
  onUpdatePoi,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const checkpointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const initializedForTrailRef = useRef<string | null>(null);
  const linePopupRef = useRef<maplibregl.Popup | null>(null);
  const [mapStatus, setMapStatus] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const interactionRef = useRef({
    canEdit,
    mode,
    selectedCheckpointIndex,
    onAddCheckpoint,
    onAddDetour,
    onAddPoiAtLine,
    onUpdateCheckpoint,
  });

  useEffect(() => {
    interactionRef.current = {
      canEdit,
      mode,
      selectedCheckpointIndex,
      onAddCheckpoint,
      onAddDetour,
      onAddPoiAtLine,
      onUpdateCheckpoint,
    };
  }, [canEdit, mode, onAddCheckpoint, onAddDetour, onAddPoiAtLine, onUpdateCheckpoint, selectedCheckpointIndex]);

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      if (!mapContainerRef.current || mapRef.current) return;
      const openFreeMapAvailable = await canUseOpenFreeMap();
      if (disposed || !mapContainerRef.current) return;

      const centerPoint = trail?.points[0] || { lat: 59.3293, lon: 18.0686 };
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: openFreeMapAvailable ? OPEN_FREE_MAP_STYLE : OSM_FALLBACK_STYLE,
        center: [centerPoint.lon, centerPoint.lat],
        zoom: 12,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
      map.on('load', () => setMapReady(true));
      if (!openFreeMapAvailable) {
        setMapStatus('Using OpenStreetMap tiles for editing right now.');
      }

      const openLineActionPopup = (lngLat: maplibregl.LngLat) => {
        if (!interactionRef.current.canEdit) return;
        linePopupRef.current?.remove();

        const wrapper = document.createElement('div');
        wrapper.style.minWidth = '190px';
        wrapper.style.color = '#0f172a';
        wrapper.style.fontFamily = 'Inter, system-ui, sans-serif';

        const title = document.createElement('div');
        title.textContent = 'Connector actions';
        title.style.fontSize = '13px';
        title.style.fontWeight = '800';
        title.style.marginBottom = '8px';
        wrapper.appendChild(title);

        const hint = document.createElement('div');
        hint.textContent = 'Add a checkpoint or a POI directly on this line.';
        hint.style.fontSize = '12px';
        hint.style.color = '#475569';
        hint.style.marginBottom = '10px';
        wrapper.appendChild(hint);

        const checkpointButton = document.createElement('button');
        checkpointButton.textContent = 'Add checkpoint';
        checkpointButton.style.marginRight = '8px';
        checkpointButton.style.border = '0';
        checkpointButton.style.borderRadius = '12px';
        checkpointButton.style.padding = '8px 10px';
        checkpointButton.style.background = '#0f172a';
        checkpointButton.style.color = '#fff';
        checkpointButton.style.fontWeight = '700';
        checkpointButton.style.cursor = 'pointer';
        checkpointButton.onclick = () => {
          interactionRef.current.onAddCheckpoint(lngLat.lat, lngLat.lng);
          linePopupRef.current?.remove();
        };

        const poiButton = document.createElement('button');
        poiButton.textContent = 'Add POI';
        poiButton.style.border = '1px solid #cbd5e1';
        poiButton.style.borderRadius = '12px';
        poiButton.style.padding = '8px 10px';
        poiButton.style.background = '#fff';
        poiButton.style.color = '#0f172a';
        poiButton.style.fontWeight = '700';
        poiButton.style.cursor = 'pointer';
        poiButton.onclick = () => {
          interactionRef.current.onAddPoiAtLine(lngLat.lat, lngLat.lng);
          linePopupRef.current?.remove();
        };

        wrapper.appendChild(checkpointButton);
        wrapper.appendChild(poiButton);

        linePopupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true })
          .setLngLat(lngLat)
          .setDOMContent(wrapper)
          .addTo(map);
      };

      map.on('click', (event) => {
        const current = interactionRef.current;
        const lineFeatures = map.queryRenderedFeatures(event.point, {
          layers: ['trail-route-hitbox', 'trail-branch-hitbox'].filter((layerId) => Boolean(map.getLayer(layerId))),
        });

        if (lineFeatures.length) {
          openLineActionPopup(event.lngLat);
          return;
        }

        if (!current.canEdit) return;
        if (current.mode === 'checkpoint') {
          current.onAddCheckpoint(event.lngLat.lat, event.lngLat.lng);
          return;
        }
        if (current.mode === 'detour') {
          current.onAddDetour(event.lngLat.lat, event.lngLat.lng);
          return;
        }
        if (current.selectedCheckpointIndex !== null) {
          current.onUpdateCheckpoint(current.selectedCheckpointIndex, event.lngLat.lat, event.lngLat.lng);
        }
      });

      map.on('mousemove', (event) => {
        const lineFeatures = map.queryRenderedFeatures(event.point, {
          layers: ['trail-route-hitbox', 'trail-branch-hitbox'].filter((layerId) => Boolean(map.getLayer(layerId))),
        });
        map.getCanvas().style.cursor = lineFeatures.length ? 'pointer' : '';
      });

      mapRef.current = map;
    }

    void initialize();
    return () => {
      disposed = true;
    };
  }, [canEdit, mode, onAddCheckpoint, onAddDetour, trail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trail || !mapReady) return;

    const routeGeoJson = {
      type: 'FeatureCollection' as const,
      features: trail.points.length >= 2 ? [{
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: trail.points.map((point) => [point.lon, point.lat]),
        },
        properties: {},
      }] : [],
    };

    const branchGeoJson = {
      type: 'FeatureCollection' as const,
      features: trail.pois
        .map((poi) => {
          const anchorIndex = typeof poi.anchorPointIndex === 'number'
            ? poi.anchorPointIndex
            : nearestTrailPointIndex(trail.points, poi.lat, poi.lon);
          const anchor = trail.points[anchorIndex];
          if (!anchor) return null;
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: [[anchor.lon, anchor.lat], [poi.lon, poi.lat]],
            },
            properties: {},
          };
        })
        .filter(Boolean),
    };

    if (map.getSource('trail-route')) {
      (map.getSource('trail-route') as GeoJSONSource).setData(routeGeoJson);
    } else {
      map.addSource('trail-route', { type: 'geojson', data: routeGeoJson });
      map.addLayer({
        id: 'trail-route-line',
        type: 'line',
        source: 'trail-route',
        paint: {
          'line-color': '#10b981',
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'trail-route-hitbox',
        type: 'line',
        source: 'trail-route',
        paint: {
          'line-color': '#10b981',
          'line-width': 18,
          'line-opacity': 0.01,
        },
      });
    }

    if (map.getSource('trail-branches')) {
      (map.getSource('trail-branches') as GeoJSONSource).setData(branchGeoJson as any);
    } else {
      map.addSource('trail-branches', { type: 'geojson', data: branchGeoJson as any });
      map.addLayer({
        id: 'trail-branch-lines',
        type: 'line',
        source: 'trail-branches',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3,
          'line-dasharray': [1.5, 1.5],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'trail-branch-hitbox',
        type: 'line',
        source: 'trail-branches',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 16,
          'line-opacity': 0.01,
        },
      });
    }

    checkpointMarkersRef.current.forEach((marker) => marker.remove());
    checkpointMarkersRef.current = trail.points.map((point, index) => {
      const element = createCheckpointNode(index, selectedCheckpointIndex === index);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectCheckpoint(index);
        onSelectPoi(null);
      });
      const marker = new maplibregl.Marker({ element, draggable: canEdit })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
      if (canEdit) {
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          onUpdateCheckpoint(index, lngLat.lat, lngLat.lng);
        });
      }
      return marker;
    });

    poiMarkersRef.current.forEach((marker) => marker.remove());
    poiMarkersRef.current = trail.pois.map((poi) => {
      const element = createPoiNode(poi.kind, poi.rewardPoints || 0, selectedPoiId === poi.id);
      element.title = `${poi.name} • ${poi.rewardPoints || 0} pts`;
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectPoi(poi.id);
        onSelectCheckpoint(null);
      });
      const marker = new maplibregl.Marker({ element, draggable: canEdit })
        .setLngLat([poi.lon, poi.lat])
        .addTo(map);
      if (canEdit) {
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          onUpdatePoi(poi.id, lngLat.lat, lngLat.lng);
        });
      }
      return marker;
    });

    if (initializedForTrailRef.current !== trail.id) {
      initializedForTrailRef.current = trail.id;
      const bounds = new maplibregl.LngLatBounds();
      if (trail.points.length) {
        trail.points.forEach((point) => bounds.extend([point.lon, point.lat]));
      }
      trail.pois.forEach((poi) => bounds.extend([poi.lon, poi.lat]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 14 });
      }
    }
  }, [canEdit, mapReady, onSelectCheckpoint, onSelectPoi, onUpdateCheckpoint, onUpdatePoi, selectedCheckpointIndex, selectedPoiId, trail]);

  useEffect(() => {
    return () => {
      checkpointMarkersRef.current.forEach((marker) => marker.remove());
      poiMarkersRef.current.forEach((marker) => marker.remove());
      linePopupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-2">
      <div ref={mapContainerRef} className="flex-1 w-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 flex-shrink-0">
        <span>Mode: {mode === 'select' ? 'Select/drag' : mode === 'checkpoint' ? 'Add checkpoint on click' : 'Add detour on click'}</span>
        <span>{mapStatus || 'Click line to add checkpoint or POI'}</span>
      </div>
    </div>
  );
}
