export type TrailPoint = {
  lat: number;
  lon: number;
  ele?: number | null;
  label?: string;
  timestamp?: string;
};

export type TrailPoiKind = 'checkpoint' | 'detour' | 'scenic' | 'water' | 'photo';

export type TrailPoi = {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lon: number;
  kind: TrailPoiKind;
  distanceFromTrailM?: number;
  linkedPoiId?: string;
  externalPoiId?: string;
  anchorPointIndex?: number;
  rewardPoints?: number;
};

export type TrailPhotoSubmission = {
  id: string;
  trailId: string;
  trailName: string;
  contributor: string;
  title: string;
  note: string;
  lat: number;
  lon: number;
  accuracyM: number;
  distanceFromTrailM: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  submittedAt: string;
  capturedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  previewUrl?: string;
  targetPoiName?: string;
  device?: string;
};

export type TrailDraft = {
  id: string;
  ownerKey: string;
  ownerName: string;
  publishedRouteId?: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'moderate' | 'hard' | 'expert';
  surface: string;
  region: string;
  durationMin: number;
  distanceKm: number;
  views: number;
  reputation: number;
  published: boolean;
  minted: boolean;
  importedFrom?: string;
  sourceFormat?: string;
  createdAt: string;
  updatedAt: string;
  points: TrailPoint[];
  pois: TrailPoi[];
  photoSubmissions: TrailPhotoSubmission[];
};

export type ParsedTrailImport = {
  name: string;
  sourceFormat: string;
  points: TrailPoint[];
  pois: TrailPoi[];
  distanceKm: number;
  estimatedDurationMin: number;
  warnings: string[];
};

const STORAGE_PREFIX = 'ontrail_trail_studio_v1';
const PHOTO_QUEUE_PREFIX = 'ontrail_trail_photo_queue_v1';

export const SUPPORTED_IMPORT_FORMATS = [
  'Google Earth (KML, KMZ)',
  'Google Maps directions (XML, JSON)',
  'PCX5 tracks and markers',
  'GPX tracks, routes and markers',
  'GPX Garmin Streetpilot',
  'Garmin Course (CRS, TCX)',
  'FIT (ANT+)',
  'MS Excel and CSV',
  'Falk IBEX Tour',
  'CompeGPS',
  'VDO GP7 (TRC)',
  'GeoRSS',
  'Logbook',
  'NMEA',
  'OVL (ASCII)',
  'Fugawi',
  'KOMPASS Verlag (Alpenverein)',
  'TrainingPeaks (PWX)',
  'Navigon Route',
  'OziExplorer',
  'qpeGps Track',
  'MagicMaps IKT',
  'TomTom BIN / ITN',
  'Suunto SDF',
  'Magellan Track',
  'PathAway',
];

export function createTrailId(prefix = 'trail') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampDifficulty(distanceKm: number): TrailDraft['difficulty'] {
  if (distanceKm >= 25) return 'expert';
  if (distanceKm >= 14) return 'hard';
  if (distanceKm >= 6) return 'moderate';
  return 'easy';
}

function fileExtension(fileName: string) {
  const clean = fileName.trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1) : '';
}

function formatFromExtension(ext: string) {
  const map: Record<string, string> = {
    kml: 'KML',
    kmz: 'KMZ',
    xml: 'XML',
    json: 'JSON',
    geojson: 'GeoJSON',
    pcx5: 'PCX5',
    gpx: 'GPX',
    crs: 'CRS',
    tcx: 'TCX',
    fit: 'FIT',
    xls: 'Excel',
    xlsx: 'Excel',
    csv: 'CSV',
    trc: 'TRC',
    rss: 'GeoRSS',
    nmea: 'NMEA',
    ovl: 'OVL',
    pwx: 'PWX',
    itn: 'TomTom ITN',
    sdf: 'Suunto SDF',
    log: 'Logbook',
    txt: 'ASCII route text',
    bin: 'TomTom BIN',
  };

  return map[ext] || (ext ? ext.toUpperCase() : 'Trail file');
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractFirstTag(content: string, tagName: string) {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i').exec(content);
  return match ? decodeXmlText(match[1]) : '';
}

function uniquePoints(points: TrailPoint[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.lat.toFixed(6)}:${point.lon.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function calculateTrailDistanceKm(points: TrailPoint[]) {
  if (points.length < 2) return 0;
  let totalMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalMeters += calculateDistanceMeters(
      { lat: points[index - 1].lat, lon: points[index - 1].lon },
      { lat: points[index].lat, lon: points[index].lon },
    );
  }
  return Math.round((totalMeters / 1000) * 100) / 100;
}

export function metersFromTrail(points: TrailPoint[], lat: number, lon: number) {
  if (!points.length) return Number.POSITIVE_INFINITY;
  return points.reduce((closest, point) => (
    Math.min(closest, calculateDistanceMeters({ lat: point.lat, lon: point.lon }, { lat, lon }))
  ), Number.POSITIVE_INFINITY);
}

export function nearestTrailPointIndex(points: TrailPoint[], lat: number, lon: number) {
  if (!points.length) return 0;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = calculateDistanceMeters({ lat: point.lat, lon: point.lon }, { lat, lon });
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function defaultRewardPoints(kind: TrailPoiKind) {
  if (kind === 'detour') return 35;
  if (kind === 'scenic') return 25;
  if (kind === 'water') return 15;
  if (kind === 'photo') return 20;
  return 10;
}

export function insertTrailPoint(points: TrailPoint[], afterIndex: number, point: TrailPoint) {
  const next = [...points];
  const insertAt = Math.max(0, Math.min(next.length, afterIndex + 1));
  next.splice(insertAt, 0, point);
  return next.map((entry, index) => ({
    ...entry,
    label: entry.label || `Checkpoint ${index + 1}`,
  }));
}

export function moveTrailPoint(points: TrailPoint[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= points.length || toIndex >= points.length) {
    return [...points];
  }
  const next = [...points];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((entry, index) => ({
    ...entry,
    label: entry.label || `Checkpoint ${index + 1}`,
  }));
}

export function createDetourPoi(points: TrailPoint[], lat: number, lon: number, name: string, note = ''): TrailPoi {
  const anchorPointIndex = nearestTrailPointIndex(points, lat, lon);
  return {
    id: createTrailId('poi'),
    name,
    note,
    lat: round(lat),
    lon: round(lon),
    kind: 'detour',
    distanceFromTrailM: Math.round(metersFromTrail(points, lat, lon)),
    anchorPointIndex,
    rewardPoints: defaultRewardPoints('detour'),
  };
}

export function syncPoiConnections(points: TrailPoint[], pois: TrailPoi[]) {
  return pois.map((poi) => ({
    ...poi,
    anchorPointIndex: points.length ? nearestTrailPointIndex(points, poi.lat, poi.lon) : poi.anchorPointIndex,
    distanceFromTrailM: Number.isFinite(metersFromTrail(points, poi.lat, poi.lon))
      ? Math.round(metersFromTrail(points, poi.lat, poi.lon))
      : poi.distanceFromTrailM,
    rewardPoints: poi.rewardPoints ?? defaultRewardPoints(poi.kind),
  }));
}

export function canDeleteTrail(trail: { minted: boolean }) {
  return !trail.minted;
}

function looksLikeJson(content: string) {
  return content.trim().startsWith('{') || content.trim().startsWith('[');
}

function looksLikeCsv(content: string, ext: string) {
  if (['csv', 'xls', 'xlsx'].includes(ext)) return true;
  const firstLine = content.split(/\r?\n/, 1)[0] || '';
  return firstLine.includes(',') && /(lat|lon|lng|latitude|longitude)/i.test(firstLine);
}

function parseJsonTrail(content: string): Partial<ParsedTrailImport> {
  const data = JSON.parse(content);
  const points: TrailPoint[] = [];
  const pois: TrailPoi[] = [];

  const collect = (value: any) => {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
      const [lon, lat, ele] = value.coordinates;
      if (typeof lat === 'number' && typeof lon === 'number') {
        points.push({ lat: round(lat), lon: round(lon), ele: toNumber(ele) });
      }
    }

    const lat = toNumber(value.lat ?? value.latitude);
    const lon = toNumber(value.lon ?? value.lng ?? value.longitude);
    if (lat !== null && lon !== null) {
      const name = String(value.name ?? value.title ?? value.label ?? '').trim();
      const kind = String(value.kind ?? value.type ?? '').toLowerCase();
      if (name || kind.includes('poi') || kind.includes('detour')) {
        pois.push({
          id: createTrailId('poi'),
          name: name || `POI ${pois.length + 1}`,
          lat: round(lat),
          lon: round(lon),
          kind: kind.includes('detour') ? 'detour' : 'checkpoint',
          note: String(value.description ?? value.note ?? '').trim(),
        });
      }
      points.push({ lat: round(lat), lon: round(lon), ele: toNumber(value.ele ?? value.altitude) });
    }

    Object.values(value).forEach(collect);
  };

  collect(data);

  return {
    name: String(data.name ?? data.title ?? data.routeName ?? '').trim(),
    points: uniquePoints(points),
    pois,
  };
}

function parseCsvTrail(content: string): Partial<ParsedTrailImport> {
  const rows = content.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return { points: [], pois: [] };
  const headers = rows[0].split(/[;,\t]/).map((cell) => cell.trim().toLowerCase());
  const latIndex = headers.findIndex((header) => ['lat', 'latitude'].includes(header));
  const lonIndex = headers.findIndex((header) => ['lon', 'lng', 'longitude'].includes(header));
  const nameIndex = headers.findIndex((header) => ['name', 'title', 'label'].includes(header));
  const kindIndex = headers.findIndex((header) => ['kind', 'type', 'poi_type'].includes(header));
  const noteIndex = headers.findIndex((header) => ['note', 'description', 'desc'].includes(header));

  const points: TrailPoint[] = [];
  const pois: TrailPoi[] = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const cells = row.split(/[;,\t]/).map((cell) => cell.trim());
    const lat = toNumber(cells[latIndex]);
    const lon = toNumber(cells[lonIndex]);
    if (lat === null || lon === null) return;

    points.push({ lat: round(lat), lon: round(lon) });
    const kindRaw = (kindIndex >= 0 ? cells[kindIndex] : '').toLowerCase();
    if (nameIndex >= 0 || kindRaw) {
      pois.push({
        id: createTrailId('poi'),
        name: (nameIndex >= 0 ? cells[nameIndex] : '') || `Point ${rowIndex + 1}`,
        lat: round(lat),
        lon: round(lon),
        kind: kindRaw.includes('detour') ? 'detour' : 'checkpoint',
        note: noteIndex >= 0 ? cells[noteIndex] : '',
      });
    }
  });

  return { points: uniquePoints(points), pois };
}

function parseNmeaCoordinate(value: string, direction: string) {
  if (!value) return null;
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  const degrees = Math.floor(numeric / 100);
  const minutes = numeric - degrees * 100;
  const decimal = degrees + minutes / 60;
  return ['S', 'W'].includes(direction.toUpperCase()) ? -decimal : decimal;
}

function parseNmeaTrail(content: string): Partial<ParsedTrailImport> {
  const points: TrailPoint[] = [];
  for (const line of content.split(/\r?\n/)) {
    const parts = line.split(',');
    if (!parts[0]?.startsWith('$')) continue;

    if (parts[0].includes('GGA') || parts[0].includes('RMC')) {
      const lat = parseNmeaCoordinate(parts[2] || parts[3], parts[3] || parts[4] || 'N');
      const lon = parseNmeaCoordinate(parts[4] || parts[5], parts[5] || parts[6] || 'E');
      if (lat !== null && lon !== null) {
        points.push({ lat: round(lat), lon: round(lon) });
      }
    }
  }
  return { points: uniquePoints(points), pois: [] };
}

function parseXmlTrail(content: string): Partial<ParsedTrailImport> {
  const points: TrailPoint[] = [];
  const pois: TrailPoi[] = [];

  const coordinateBlocks = content.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi) || [];
  coordinateBlocks.forEach((block) => {
    const inner = block.replace(/<[^>]+>/g, ' ').trim();
    inner.split(/\s+/).forEach((entry) => {
      const [lonText, latText, eleText] = entry.split(',');
      const lat = toNumber(latText);
      const lon = toNumber(lonText);
      if (lat !== null && lon !== null) {
        points.push({ lat: round(lat), lon: round(lon), ele: toNumber(eleText) });
      }
    });
  });

  const attributePointRegex = /<(trkpt|rtept|wpt|pt|Waypoint)[^>]*?lat=["']([-.\d]+)["'][^>]*?(?:lon|lng)=["']([-.\d]+)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = attributePointRegex.exec(content))) {
    const tag = attributeMatch[1].toLowerCase();
    const lat = toNumber(attributeMatch[2]);
    const lon = toNumber(attributeMatch[3]);
    if (lat === null || lon === null) continue;
    const body = attributeMatch[4] || '';
    const name = extractFirstTag(body, 'name') || extractFirstTag(body, 'desc') || extractFirstTag(body, 'cmt');
    const point = { lat: round(lat), lon: round(lon), ele: toNumber(extractFirstTag(body, 'ele')) };
    if (tag !== 'wpt') {
      points.push(point);
    }
    if (tag === 'wpt' || name) {
      pois.push({
        id: createTrailId('poi'),
        name: name || `POI ${pois.length + 1}`,
        lat: point.lat,
        lon: point.lon,
        kind: /detour|scenic|view/i.test(name) ? 'detour' : 'checkpoint',
        note: extractFirstTag(body, 'desc') || '',
      });
    }
  }

  const trackPointRegex = /<Trackpoint[\s\S]*?<LatitudeDegrees>([-.\d]+)<\/LatitudeDegrees>[\s\S]*?<LongitudeDegrees>([-.\d]+)<\/LongitudeDegrees>[\s\S]*?<\/Trackpoint>/gi;
  let trackMatch: RegExpExecArray | null;
  while ((trackMatch = trackPointRegex.exec(content))) {
    const lat = toNumber(trackMatch[1]);
    const lon = toNumber(trackMatch[2]);
    if (lat !== null && lon !== null) {
      points.push({ lat: round(lat), lon: round(lon) });
    }
  }

  const geoRssRegex = /<georss:point[^>]*>([-.\d]+)\s+([-.\d]+)<\/georss:point>/gi;
  let geoMatch: RegExpExecArray | null;
  while ((geoMatch = geoRssRegex.exec(content))) {
    const lat = toNumber(geoMatch[1]);
    const lon = toNumber(geoMatch[2]);
    if (lat !== null && lon !== null) {
      points.push({ lat: round(lat), lon: round(lon) });
    }
  }

  return {
    name: extractFirstTag(content, 'name'),
    points: uniquePoints(points),
    pois,
  };
}

function parseGenericCoordinates(content: string): Partial<ParsedTrailImport> {
  const points: TrailPoint[] = [];
  const regex = /(-?\d{1,2}\.\d{3,})[^\d-]+(-?\d{1,3}\.\d{3,})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const first = toNumber(match[1]);
    const second = toNumber(match[2]);
    if (first === null || second === null) continue;
    const lat = Math.abs(first) <= 90 ? first : second;
    const lon = lat === first ? second : first;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      points.push({ lat: round(lat), lon: round(lon) });
    }
  }
  return { points: uniquePoints(points), pois: [] };
}

export function parseTrailFileContent(fileName: string, rawContent: string): ParsedTrailImport {
  const ext = fileExtension(fileName);
  const content = rawContent.replace(/\0/g, ' ').trim();
  const warnings: string[] = [];

  let partial: Partial<ParsedTrailImport> = {};

  try {
    if (looksLikeJson(content)) {
      partial = parseJsonTrail(content);
    } else if (looksLikeCsv(content, ext)) {
      partial = parseCsvTrail(content);
    } else if (ext === 'nmea' || /^\$(GP|GN|GL)/m.test(content)) {
      partial = parseNmeaTrail(content);
    } else {
      partial = parseXmlTrail(content);
    }
  } catch {
    warnings.push('The importer used a fallback parser for this file. Review the result before publishing.');
  }

  let points = uniquePoints(partial.points || []);
  const pois = partial.pois || [];

  if (!points.length) {
    const generic = parseGenericCoordinates(content);
    points = generic.points || [];
  }

  if (!points.length && pois.length) {
    points = pois.map((poi) => ({ lat: poi.lat, lon: poi.lon, label: poi.name }));
  }

  if (!points.length) {
    warnings.push('No GPS line could be extracted automatically. You can still enrich the trail manually in the editor.');
  }

  const distanceKm = calculateTrailDistanceKm(points);

  return {
    name: (partial.name || fileName.replace(/\.[^.]+$/, '')).trim(),
    sourceFormat: formatFromExtension(ext),
    points,
    pois,
    distanceKm,
    estimatedDurationMin: Math.max(20, Math.round((distanceKm || Math.max(1, points.length * 0.5)) * 12)),
    warnings,
  };
}

export async function parseTrailImportFile(file: File): Promise<ParsedTrailImport> {
  const buffer = await file.arrayBuffer();
  let content = '';
  try {
    content = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    content = new TextDecoder().decode(buffer);
  }
  return parseTrailFileContent(file.name, content);
}

export function createSnapshotDataUri(points: TrailPoint[], title: string) {
  const width = 640;
  const height = 360;

  const fallback = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="55%" stop-color="#0f766e" />
          <stop offset="100%" stop-color="#86efac" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="32" fill="url(#bg)" />
      <circle cx="132" cy="110" r="72" fill="rgba(255,255,255,0.12)" />
      <circle cx="520" cy="250" r="90" fill="rgba(255,255,255,0.08)" />
      <text x="44" y="298" font-size="28" font-family="Arial" fill="white" font-weight="700">${title}</text>
      <text x="44" y="326" font-size="14" font-family="Arial" fill="rgba(255,255,255,0.8)">Trail snapshot</text>
    </svg>
  `.trim();

  if (points.length < 2) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallback)}`;
  }

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;

  const polyline = points.map((point) => {
    const x = 60 + ((point.lon - minLon) / lonRange) * 520;
    const y = 50 + (1 - (point.lat - minLat) / latRange) * 250;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0b1220" />
          <stop offset="45%" stop-color="#155e75" />
          <stop offset="100%" stop-color="#bbf7d0" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="32" fill="url(#bg)" />
      <g opacity="0.18" stroke="white">
        <path d="M40 80H600" />
        <path d="M40 160H600" />
        <path d="M40 240H600" />
        <path d="M120 32V320" />
        <path d="M260 32V320" />
        <path d="M400 32V320" />
        <path d="M540 32V320" />
      </g>
      <polyline points="${polyline}" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.24" />
      <polyline points="${polyline}" fill="none" stroke="#86efac" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${polyline.split(' ')[0]?.split(',')[0] || 60}" cy="${polyline.split(' ')[0]?.split(',')[1] || 60}" r="8" fill="#ffffff" />
      <circle cx="${polyline.split(' ').at(-1)?.split(',')[0] || 580}" cy="${polyline.split(' ').at(-1)?.split(',')[1] || 300}" r="8" fill="#ecfeff" />
      <text x="44" y="298" font-size="28" font-family="Arial" fill="white" font-weight="700">${title}</text>
      <text x="44" y="326" font-size="14" font-family="Arial" fill="rgba(255,255,255,0.8)">${points.length} route points</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createStarterTrail(ownerKey: string, ownerName: string): TrailDraft {
  const points: TrailPoint[] = [
    { lat: 59.3293, lon: 18.0686, label: 'Start' },
    { lat: 59.3304, lon: 18.073, label: 'Forest bend' },
    { lat: 59.3325, lon: 18.0782, label: 'Summit' },
    { lat: 59.3337, lon: 18.0816, label: 'Finish' },
  ];

  const pois: TrailPoi[] = [
    { id: createTrailId('poi'), name: 'Start gate', lat: 59.3293, lon: 18.0686, kind: 'checkpoint', rewardPoints: defaultRewardPoints('checkpoint'), anchorPointIndex: 0 },
    { id: createTrailId('poi'), name: 'Scenic shelf', lat: 59.332, lon: 18.0797, kind: 'detour', distanceFromTrailM: 180, rewardPoints: defaultRewardPoints('detour'), anchorPointIndex: 2 },
    { id: createTrailId('poi'), name: 'Finish ridge', lat: 59.3337, lon: 18.0816, kind: 'checkpoint', rewardPoints: defaultRewardPoints('checkpoint'), anchorPointIndex: 3 },
  ];

  return {
    id: createTrailId(),
    ownerKey,
    ownerName,
    name: `${ownerName || 'Your'} coastal studio trail`,
    description: 'Imported mobile draft ready for polish, POIs, photos, and minting.',
    difficulty: 'moderate',
    surface: 'mixed trail',
    region: 'Stockholm archipelago',
    durationMin: 65,
    distanceKm: calculateTrailDistanceKm(points),
    views: 128,
    reputation: 84,
    published: false,
    minted: false,
    importedFrom: 'mobile draft',
    sourceFormat: 'OnTrail mobile',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    points,
    pois,
    photoSubmissions: [],
  };
}

export function projectDetourPoi(points: TrailPoint[], offsetMeters: number, name: string, note = ''): TrailPoi {
  const anchorPointIndex = Math.max(0, Math.floor(points.length / 2) - 1);
  const anchor = points[anchorPointIndex] || { lat: 59.3293, lon: 18.0686 };
  const latOffset = offsetMeters / 111_111;
  const lonOffset = offsetMeters / (111_111 * Math.cos((anchor.lat * Math.PI) / 180));
  return createDetourPoi(
    points,
    round(anchor.lat + latOffset * 0.55),
    round(anchor.lon + lonOffset * 0.55),
    name,
    note,
  );
}

export function loadTrailDrafts(ownerKey: string): TrailDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${ownerKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrailDrafts(ownerKey: string, trails: TrailDraft[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}:${ownerKey}`, JSON.stringify(trails));
}

export function loadSharedPhotoQueue(): TrailPhotoSubmission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PHOTO_QUEUE_PREFIX);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSharedPhotoQueue(queue: TrailPhotoSubmission[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PHOTO_QUEUE_PREFIX, JSON.stringify(queue));
}
