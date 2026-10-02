import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { sealTolerance } from './lightingConstants';
import { PointGrid } from './pointGrid';

/** A hair past the wall a bridge lands on, so the two cross instead of merely touching. */
const OVERSHOOT = 0.01;

/** The bridges a wall end takes on at most, of each kind: to other ends, and across walls it stops short of. */
const MAX_BRIDGES = 8;

interface End {
  wall: number;
  end: 'p1' | 'p2';
  point: Point;
  /** The wall's id and the end, as bridges are named after it. */
  label: string;
}

/** A place where walls end: the ends that share the point, in the order of their walls. */
interface Junction {
  /** Its place among the junctions, in the order of their first walls. */
  index: number;
  point: Point;
  ends: End[];
  /** `firstEnds`, once they were asked for. */
  first?: End[];
}

/**
 * Closes the gaps of hand-drawn joints before walls reach light or sight, without moving a
 * wall: every wall end within `tolerance` of another wall's end gets a solid bridge to it, and
 * every wall end within `tolerance` of another wall's middle (and not of its ends) gets a bridge
 * that lands just across it. Returns the walls unchanged followed by the bridges; wider gaps
 * stay open for light and sight alike.
 *
 * The bridges grow with the wall ends, not with their pairs: an end with more than
 * `MAX_BRIDGES` others near it is bridged to the nearest in each of eight directions only
 * (`nearestByDirection`), and across the `MAX_BRIDGES` nearest of the walls it stops short of.
 * A damaged or foreign map with thousands of ends in one place would otherwise make millions
 * of bridges and never open.
 */
export function sealWalls(walls: readonly WallSegment[], tolerance: number): WallSegment[] {
  const junctions = new Map<string, Junction>();
  walls.forEach((wall, i) => {
    if (!hasLength(wall)) return;
    for (const end of ['p1', 'p2'] as const) {
      const point = wall[end];
      let junction = junctions.get(pointKey(point));
      if (!junction) junctions.set(pointKey(point), (junction = { index: junctions.size, point, ends: [] }));
      junction.ends.push({ wall: i, end, point, label: `${wall.id}:${end}` });
    }
  });
  const reach = Math.max(tolerance, 1);
  // Cells as small as each search allows, so a crowded place is looked through as rarely as can be:
  // a point's neighbours lie a tolerance around it, and `besideSegment` reaches 0.86 cells from a segment.
  const near = new PointGrid<Junction>(reach);
  const along = new PointGrid<Junction>(reach * 1.5);
  for (const junction of junctions.values()) {
    near.add(junction.point, junction);
    along.add(junction.point, junction);
  }
  return [...walls, ...endBridges(walls, junctions, near, tolerance), ...middleBridges(walls, along, tolerance)];
}

const sealed = new WeakMap<readonly WallSegment[], Map<number, readonly WallSegment[]>>();

/** `sealWalls` at the tolerance of a map's texel, the same array for as long as the input is unchanged. */
export function sealedWalls(walls: readonly WallSegment[], texel: number): readonly WallSegment[] {
  let byTexel = sealed.get(walls);
  if (!byTexel) sealed.set(walls, (byTexel = new Map<number, readonly WallSegment[]>()));
  let result = byTexel.get(texel);
  if (!result) {
    result = sealWalls(walls, sealTolerance(texel));
    byTexel.set(texel, result);
  }
  return result;
}

/**
 * One bridge per pair of nearby places where different walls end; coinciding ends need none.
 * A place with more than `MAX_BRIDGES` others near it is bridged to the nearest in each of eight
 * directions (45° each) only. That closes every gap that bridging all of them would: towards any
 * place B near a place A, the nearest in B's direction is no farther from A than B is, and
 * nearer to B than A is (the directions are narrower than 60°), and so on from there, so a chain
 * of bridges leads from A to B without leaving the circle around B that A lies on. What a bridge
 * from A to B would part, the chain parts too, but for what lies inside that circle, within the
 * tolerance of both.
 */
function endBridges(walls: readonly WallSegment[], junctions: ReadonlyMap<string, Junction>, grid: PointGrid<Junction>, tolerance: number): WallSegment[] {
  const bridges = new Map<number, WallSegment>();
  const few: Junction[] = [];
  const nearest: (Junction | undefined)[] = [];
  const nearestDistance = new Float64Array(8);
  for (const a of junctions.values()) {
    few.length = 0;
    nearest.length = 0;
    let count = 0;
    grid.eachWithin(a.point, tolerance, (b, dx, dy, distance) => {
      if (distance === 0) return;
      if (count++ < MAX_BRIDGES) few.push(b);
      // The octant: which half plane on each axis, and which axis is the longer.
      const octant = (dx < 0 ? 4 : 0) + (dy < 0 ? 2 : 0) + (Math.abs(dx) < Math.abs(dy) ? 1 : 0);
      if (nearest[octant] && nearestDistance[octant]! <= distance) return;
      nearest[octant] = b;
      nearestDistance[octant] = distance;
    });
    for (const b of count > MAX_BRIDGES ? nearest : few) {
      if (!b) continue;
      const key = Math.min(a.index, b.index) * junctions.size + Math.max(a.index, b.index);
      if (bridges.has(key)) continue;
      const pair = firstPair(a, b);
      if (pair) bridges.set(key, bridge(`seal:${pair.first}:${pair.second}`, pair.from, pair.to));
    }
  }
  return [...bridges.values()];
}

/**
 * The bridge between two places is named after the pair of ends, of different walls, whose
 * labels sort first, and runs from the end of the earlier wall; a pair of places that hold the
 * two ends of one wall and nothing else needs none. Only the first labels of each place can be
 * that pair: its first, and its first of another wall.
 */
function firstPair(a: Junction, b: Junction): { first: string; second: string; from: Point; to: Point } | null {
  let best: { first: string; second: string; from: Point; to: Point } | null = null;
  for (const x of (a.first ??= firstEnds(a))) {
    for (const y of (b.first ??= firstEnds(b))) {
      if (x.wall === y.wall) continue;
      const [first, second] = x.label < y.label ? [x.label, y.label] : [y.label, x.label];
      if (best && (best.first < first || (best.first === first && best.second <= second))) continue;
      const [from, to] = x.wall < y.wall ? [x.point, y.point] : [y.point, x.point];
      best = { first, second, from, to };
    }
  }
  return best;
}

/** The end of a place whose label sorts first, and the first among its ends of other walls. */
function firstEnds(junction: Junction): End[] {
  let first = junction.ends[0]!;
  for (const end of junction.ends) if (end.label < first.label) first = end;
  let other: End | null = null;
  for (const end of junction.ends) if (end.wall !== first.wall && (!other || end.label < other.label)) other = end;
  return other ? [first, other] : [first];
}

interface MiddleBridge {
  wall: number;
  end: End;
  distance: number;
  landing: Point;
}

/**
 * Bridges from a wall end across the nearby middle of another wall (a T-junction stopping
 * short): across the `MAX_BRIDGES` nearest such walls where an end has more of them.
 */
function middleBridges(walls: readonly WallSegment[], grid: PointGrid<Junction>, tolerance: number): WallSegment[] {
  const kept = new Map<Junction, MiddleBridge[]>();
  walls.forEach((wall, j) => {
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const len2 = dx * dx + dy * dy;
    if (!hasLength(wall)) return;
    grid.besideSegment(wall.p1, wall.p2, tolerance, (junction) => {
      const p = junction.point;
      const u = ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / len2;
      if (u <= 0 || u >= 1) return;
      const foot = { x: wall.p1.x + dx * u, y: wall.p1.y + dy * u };
      const distance = Math.hypot(p.x - foot.x, p.y - foot.y);
      if (distance > tolerance) return;
      // The end that stops short: of the earliest wall. This wall's own ends are its p1 and p2, left out above.
      const end = junction.ends[0]!;
      const across = acrossDirection(p, foot, walls[end.wall]![end.end === 'p1' ? 'p2' : 'p1'], dx, dy);
      keepNearest(kept, junction, { wall: j, end, distance, landing: { x: foot.x + across.x * OVERSHOOT, y: foot.y + across.y * OVERSHOOT } });
    });
  });
  return [...kept.values()]
    .flat()
    .sort((a, b) => a.wall - b.wall || a.end.wall - b.end.wall || a.end.end.localeCompare(b.end.end))
    .map(({ wall, end, landing }) => bridge(`seal:${end.label}:${walls[wall]!.id}`, end.point, landing));
}

/** Adds a bridge to those of its wall end, which keeps the `MAX_BRIDGES` nearest, earlier walls first among equals. */
function keepNearest(kept: Map<Junction, MiddleBridge[]>, junction: Junction, candidate: MiddleBridge): void {
  let list = kept.get(junction);
  if (!list) kept.set(junction, (list = []));
  if (list.length === MAX_BRIDGES && list[MAX_BRIDGES - 1]!.distance <= candidate.distance) return;
  const at = list.findIndex((held) => held.distance > candidate.distance);
  list.splice(at < 0 ? list.length : at, 0, candidate);
  if (list.length > MAX_BRIDGES) list.pop();
}

/** Unit vector from `p` across the wall at `foot`; for an end on the wall, away from its own wall. */
function acrossDirection(p: Point, foot: Point, ownOtherEnd: Point, dx: number, dy: number): Point {
  const fx = foot.x - p.x, fy = foot.y - p.y;
  const length = Math.hypot(fx, fy);
  if (length > 1e-9) return { x: fx / length, y: fy / length };
  const normal = { x: -dy / Math.hypot(dx, dy), y: dx / Math.hypot(dx, dy) };
  const side = (ownOtherEnd.x - foot.x) * normal.x + (ownOtherEnd.y - foot.y) * normal.y;
  return side > 0 ? { x: -normal.x, y: -normal.y } : normal;
}

/**
 * Whether a wall spans a distance that can be worked with. One without length joins nothing, and
 * one with a coordinate that is no finite number (a damaged map file) has no place to seal.
 */
function hasLength(wall: WallSegment): boolean {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const length2 = dx * dx + dy * dy;
  return length2 > 0 && Number.isFinite(length2);
}

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function bridge(id: string, p1: Point, p2: Point): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { ...p1 }, p2: { ...p2 } };
}
