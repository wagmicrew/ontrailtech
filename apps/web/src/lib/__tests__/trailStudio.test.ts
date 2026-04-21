import { describe, expect, it } from 'vitest';
import {
  canDeleteTrail,
  createDetourPoi,
  defaultRewardPoints,
  insertTrailPoint,
  metersFromTrail,
  moveTrailPoint,
  parseTrailFileContent,
  syncPoiConnections,
} from '../trailStudio';

describe('trailStudio helpers', () => {
  it('parses GPX trackpoints and waypoints', () => {
    const gpx = `
      <gpx>
        <trk><name>Forest Loop</name><trkseg>
          <trkpt lat="59.3293" lon="18.0686"><ele>12</ele></trkpt>
          <trkpt lat="59.3300" lon="18.0700"><ele>18</ele></trkpt>
        </trkseg></trk>
        <wpt lat="59.3297" lon="18.0692"><name>Viewpoint</name></wpt>
      </gpx>
    `;

    const parsed = parseTrailFileContent('forest.gpx', gpx);

    expect(parsed.name).toBe('Forest Loop');
    expect(parsed.points).toHaveLength(2);
    expect(parsed.pois).toHaveLength(1);
  });

  it('parses csv coordinates', () => {
    const csv = `name,lat,lon,kind\nStart,59.1,18.1,checkpoint\nFalls,59.2,18.2,detour`;
    const parsed = parseTrailFileContent('trail.csv', csv);

    expect(parsed.points).toHaveLength(2);
    expect(parsed.pois[1]?.kind).toBe('detour');
  });

  it('measures proximity from a trail', () => {
    const distance = metersFromTrail(
      [
        { lat: 59.3293, lon: 18.0686 },
        { lat: 59.3295, lon: 18.0688 },
      ],
      59.32931,
      18.06861,
    );

    expect(distance).toBeLessThan(20);
  });

  it('blocks delete for minted trails', () => {
    expect(canDeleteTrail({ minted: false })).toBe(true);
    expect(canDeleteTrail({ minted: true })).toBe(false);
  });

  it('inserts and reorders checkpoints', () => {
    const base = [
      { lat: 59.1, lon: 18.1, label: 'CP1' },
      { lat: 59.2, lon: 18.2, label: 'CP2' },
    ];

    const withInserted = insertTrailPoint(base, 0, { lat: 59.15, lon: 18.15, label: 'Mid' });
    expect(withInserted).toHaveLength(3);
    expect(withInserted[1]?.lat).toBe(59.15);

    const moved = moveTrailPoint(withInserted, 2, 0);
    expect(moved[0]?.lat).toBe(59.2);
  });

  it('creates detour poi with anchor and gamified points', () => {
    const detour = createDetourPoi(
      [
        { lat: 59.3293, lon: 18.0686 },
        { lat: 59.3301, lon: 18.0698 },
      ],
      59.3303,
      18.0702,
      'Scenic shelf',
      'Photo stop',
    );

    expect(detour.kind).toBe('detour');
    expect(detour.anchorPointIndex).toBeGreaterThanOrEqual(0);
    expect(detour.rewardPoints).toBe(defaultRewardPoints('detour'));
  });

  it('reconnects pois to the nearest checkpoint after edits', () => {
    const synced = syncPoiConnections(
      [
        { lat: 59.3293, lon: 18.0686 },
        { lat: 59.3393, lon: 18.0786 },
      ],
      [
        { id: 'p1', name: 'Water', lat: 59.32931, lon: 18.06861, kind: 'water' },
        { id: 'p2', name: 'Scenic', lat: 59.33931, lon: 18.07861, kind: 'detour' },
      ],
    );

    expect(synced[0]?.anchorPointIndex).toBe(0);
    expect(synced[1]?.anchorPointIndex).toBe(1);
  });
});
