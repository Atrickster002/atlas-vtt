import { normaliseGridOffset } from '../../grid/gridPlacement';
import { toGameUnits, type GameUnit } from '../../grid/statedDistance';
import { withEmissionValue } from '../../lighting/lightEmissionForm';
import { maxLightRange } from '../../lighting/lightRanges';
import { unitScaleOf } from '../../lighting/lightingUnits';
import type { GridState } from '../../services/MapPersistence';
import type { LightEmission, LightSource, SceneLighting } from '../../types/lightingTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { UvttLight, UvttMap, UvttPoint } from './uvttTypes';

/** Where a file's map goes: onto an image whose cells are `cellSize` world pixels wide, in a collection measuring in `unit`. */
export interface UvttTarget {
  cellSize: number;
  unit: GameUnit;
}

export interface UvttCounts {
  walls: number;
  doors: number;
  lights: number;
}

/** What a file gives a scene, in Atlas' own terms: world pixels for positions, game units for light. */
export interface UvttScene {
  grid: Pick<GridState, 'size' | 'offsetX' | 'offsetY'>;
  walls: Record<string, WallSegment>;
  lights: Record<string, LightSource>;
  lighting: SceneLighting;
  counts: UvttCounts;
}

/** A scene whose image carries its own light is shown as it is; so is one whose file names no ambient light. */
const DAYLIGHT = 1;

/** How bright a `#rrggbb` colour is, 0 to 1 (Rec. 709 luma), in hundredths. */
function brightnessOf(color: string): number {
  const channel = (start: number): number => parseInt(color.slice(start, start + 2), 16) / 255;
  return Math.round((0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)) * 100) / 100;
}

function emissionOf(light: UvttLight, { unit, cellSize }: UvttTarget): LightEmission {
  const cells = (value: number): number => toGameUnits({ value, unit: 'squares' }, unit);
  const farthest = maxLightRange(unitScaleOf(unit, { size: cellSize }));
  let emission: LightEmission = { bright: 0, dim: 0, color: light.color, intensity: 1, animation: 'none', kind: 'custom' };
  emission = withEmissionValue(emission, 'dim', cells(light.range), farthest);
  emission = withEmissionValue(emission, 'bright', Math.min(emission.dim, cells(light.range / 2)), farthest);
  return withEmissionValue(emission, 'intensity', light.intensity);
}

/**
 * The walls, doors, lights and lighting of a file as a scene holds them. A position `p` of the
 * file lies at `(p - origin) * cellSize` world pixels, with the image's top-left corner at 0, so
 * the file's grid is the scene's. Each wall line becomes one segment per pair of points, which
 * keep the exact coordinates they share; a door spans its two ends. A light is bright to half its
 * range and ends at its range, and is switched off where the image shows its glow already.
 */
export function uvttToScene(map: UvttMap, target: UvttTarget): UvttScene {
  const { cellSize } = target;
  const toWorld = (point: UvttPoint): UvttPoint => ({ x: (point.x - map.origin.x) * cellSize, y: (point.y - map.origin.y) * cellSize });
  const walls: Record<string, WallSegment> = {};
  const counts: UvttCounts = { walls: 0, doors: 0, lights: 0 };
  let segments = 0;

  const addWall = (from: UvttPoint, to: UvttPoint, rest: Pick<WallSegment, 'type' | 'closed' | 'chainId'>): boolean => {
    if (from.x === to.x && from.y === to.y) return false;
    const id = `wall_uvtt_${++segments}`;
    walls[id] = { id, kind: 'wall', p1: from, p2: to, ...rest };
    return true;
  };

  map.polylines.forEach((line, lineIndex) => {
    const points = line.map(toWorld);
    for (let index = 1; index < points.length; index++) {
      if (addWall(points[index - 1]!, points[index]!, { type: 'solid', chainId: `chain_uvtt_${lineIndex + 1}` })) counts.walls++;
    }
  });
  for (const portal of map.portals) {
    if (addWall(toWorld(portal.bounds[0]), toWorld(portal.bounds[1]), { type: 'door', closed: portal.closed })) counts.doors++;
  }

  const lights: Record<string, LightSource> = {};
  for (const light of map.lights) {
    const id = `light_uvtt_${++counts.lights}`;
    lights[id] = { id, kind: 'light', ...toWorld(light.position), emission: emissionOf(light, target), ...(map.bakedLighting && { hidden: true }) };
  }

  const ambient = map.bakedLighting || map.ambientLight === null ? DAYLIGHT : brightnessOf(map.ambientLight);
  return {
    grid: { size: cellSize, ...normaliseGridOffset('square', cellSize, -map.origin.x * cellSize, -map.origin.y * cellSize) },
    walls,
    lights,
    lighting: { enabled: true, ambient },
    counts,
  };
}

/** Sides may differ by this many pixels from what square cells give: an exporter rounds each side to whole pixels. */
const SIDE_TOLERANCE = 2;

/**
 * World pixels one cell of the file spans on its image once that is `image` pixels large, or
 * null when the image does not fit the map size the file states: its cells would not be square,
 * and walls would not lie where the image shows them.
 */
export function uvttCellSize(map: Pick<UvttMap, 'size'>, image: { width: number; height: number }): number | null {
  const cellSize = image.width / map.size.x;
  return Math.abs(cellSize * map.size.y - image.height) <= SIDE_TOLERANCE ? cellSize : null;
}
