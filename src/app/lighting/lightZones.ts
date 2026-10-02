import type { LightZone, SceneLighting } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../services/assetMetadataGuards';
import { isHexColor } from '../utils/hexColor';
import type { AmbientLight, AmbientZone } from '../vision/sight';
import { pointInPolygon } from '../vision/visibility';
import { litThresholdOf } from './sceneLightingOptions';

/** The corners a zone may have: the engine reads its outline from a list of this length. */
export const MAX_ZONE_CORNERS = 64;

const lists = new WeakMap<object, LightZone[]>();

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function readZone(value: unknown): LightZone | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.ambient !== 'number' || !Number.isFinite(value.ambient)) return null;
  const { polygon } = value;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_ZONE_CORNERS || !polygon.every(isPoint)) return null;
  return {
    id: value.id,
    kind: 'light-zone',
    polygon,
    ambient: Math.min(1, Math.max(0, value.ambient)),
    ...(typeof value.name === 'string' && value.name !== '' && { name: value.name }),
    ...(isHexColor(value.ambientColor) && { ambientColor: value.ambientColor }),
  };
}

/**
 * The zones of a map in the order they were drawn, as everything reads them: a zone that is no
 * area (a hand edit) is left out, a level outside 0–1 is brought into it and a colour that is
 * not `#rrggbb` dropped. The same list for the same record, so whoever compares lists finds
 * unchanged zones unchanged.
 */
export function lightZoneList(zones: Record<string, LightZone> | undefined): LightZone[] {
  if (!isRecord(zones)) return NONE;
  let list = lists.get(zones);
  if (!list) {
    list = Object.values(zones).flatMap((zone) => readZone(zone) ?? []);
    lists.set(zones, list);
  }
  return list;
}

const NONE: LightZone[] = [];

/** A scene's lighting as the rules read it: itself, or with its zones when it has any. */
export function withZones<Lighting extends SceneLighting>(lighting: Lighting, zones: readonly AmbientZone[]): Lighting & AmbientLight {
  return zones.length > 0 ? { ...lighting, zones } : lighting;
}

/** The ambient light a newly drawn zone starts with: dark in a lit scene (a cave), daylight in a dark one (a lit hall). */
export function newZoneAmbient(scene: Pick<SceneLighting, 'ambient' | 'litThreshold'>): number {
  return scene.ambient >= litThresholdOf(scene) ? 0 : 1;
}

/** Where a zone's handle sits: at its centroid, or at a point inside it when the zone bends around its centroid. */
export function zoneHandlePoint(polygon: readonly Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  const centroid = Math.abs(area) > 1e-6 ? { x: x / (3 * area), y: y / (3 * area) } : polygon[0]!;
  if (pointInPolygon(centroid, polygon as Point[])) return centroid;
  // ponytail: the middle of the first corner's ear; a pole of inaccessibility if zones get shapes this misses.
  for (let i = 0; i < polygon.length; i++) {
    const [a, b, c] = [polygon[i]!, polygon[(i + 1) % polygon.length]!, polygon[(i + 2) % polygon.length]!];
    const ear = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    if (pointInPolygon(ear, polygon as Point[])) return ear;
  }
  return polygon[0]!;
}
