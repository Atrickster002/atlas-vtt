import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { sealTolerance } from './lightingConstants';
import { PointGrid } from './pointGrid';
import { blocksNothing } from './segments';

/** A hair past the wall a bridge lands on, so the two cross instead of merely touching. */
const OVERSHOOT = 0.01;

/** A wall end with more than this many others near it, or walls passing it, is bridged to fewer than all of them. */
const MAX_BRIDGES = 8;
/** A wall end that more walls than this pass within the tolerance is closed off whole instead (`plug`). */
const MAX_PASSING = 64;

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
 * (`endBridges`), and one that more walls pass is bridged across those that reach farthest from
 * it (`middleBridges`). Both stop every ray that a bridge for every pair would stop, between
 * points farther than the tolerance from the wall ends. A damaged or foreign map with thousands
 * of ends in one place would otherwise make millions of bridges and never open.
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
 * tolerance of both. The two ends of one wall need no bridge, the wall being between them; where
 * that wall is an open door or blocks one way only it parts nothing, so its other end is not the
 * nearest that counts, and the next nearest in that direction is taken.
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
      // The chain may run along a wall from one of its ends to the other only if the wall stops everything.
      if (endsOfOneOpenWall(walls, a, b)) return;
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

/** Whether two places hold nothing but the two ends of one wall, and that wall is an open door or blocks one way only. */
function endsOfOneOpenWall(walls: readonly WallSegment[], a: Junction, b: Junction): boolean {
  if (a.ends.length !== 1 || b.ends.length !== 1 || a.ends[0]!.wall !== b.ends[0]!.wall) return false;
  const wall = walls[a.ends[0]!.wall]!;
  return blocksNothing(wall) || !!wall.direction;
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
  landing: Point;
}

/**
 * Bridges from a wall end across the nearby middle of another wall (a T-junction stopping
 * short). Where more than `MAX_BRIDGES` walls pass one end, only the bridges that reach
 * farthest are made: those whose landing is a corner of the convex hull of the end and all its
 * landings (`farthest`). A ray is stopped by the bridges of an end exactly when one of their
 * landings lies beyond it, and for every line that is so of a corner of the hull, if of any
 * landing at all, so the fewer bridges stop the same rays. The nearest ones would not: eight
 * walls passing an end nearer than the wall it stops short of left that gap open.
 *
 * An end that more than `MAX_PASSING` walls pass is closed off whole (`plug`): no ray enters
 * the tolerance around it, which stops all that its bridges would and more.
 */
function middleBridges(walls: readonly WallSegment[], grid: PointGrid<Junction>, tolerance: number): WallSegment[] {
  const passing = new Map<Junction, MiddleBridge[] | 'plugged'>();
  walls.forEach((wall, j) => {
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const len2 = dx * dx + dy * dy;
    if (!hasLength(wall)) return;
    grid.besideSegment(wall.p1, wall.p2, tolerance, (junction) => {
      let list = passing.get(junction);
      if (list === 'plugged') return;
      const p = junction.point;
      const u = ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / len2;
      if (u <= 0 || u >= 1) return;
      const foot = { x: wall.p1.x + dx * u, y: wall.p1.y + dy * u };
      if (Math.hypot(p.x - foot.x, p.y - foot.y) > tolerance) return;
      // The end that stops short: of the earliest wall. This wall's own ends are its p1 and p2, left out above.
      const end = junction.ends[0]!;
      const across = acrossDirection(p, foot, walls[end.wall]![end.end === 'p1' ? 'p2' : 'p1'], dx, dy);
      if (!list) passing.set(junction, (list = []));
      list.push({ wall: j, end, landing: { x: foot.x + across.x * OVERSHOOT, y: foot.y + across.y * OVERSHOOT } });
      if (list.length > MAX_PASSING) passing.set(junction, 'plugged');
    });
  });
  const kept: MiddleBridge[] = [];
  const plugs: WallSegment[] = [];
  for (const [junction, list] of passing) {
    if (list === 'plugged') plugs.push(...plug(junction, tolerance));
    else kept.push(...(list.length > MAX_BRIDGES ? farthest(junction.point, list) : list));
  }
  return [
    ...kept
      .sort((a, b) => a.wall - b.wall || a.end.wall - b.end.wall || a.end.end.localeCompare(b.end.end))
      .map(({ wall, end, landing }) => bridge(`seal:${end.label}:${walls[wall]!.id}`, end.point, landing)),
    ...plugs,
  ];
}

/** The bridges from `point` whose landings are corners of the convex hull of the point and all the landings. */
function farthest(point: Point, bridges: readonly MiddleBridge[]): MiddleBridge[] {
  const corners: { at: Point; bridge: MiddleBridge | null }[] = [{ at: point, bridge: null }, ...bridges.map((candidate) => ({ at: candidate.landing, bridge: candidate }))];
  corners.sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  // Andrew's monotone chain; a landing on a line between two others is no corner.
  const turnsLeft = (o: Point, a: Point, b: Point): boolean => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) > 1e-9;
  const half = (order: typeof corners): typeof corners => {
    const hull: typeof corners = [];
    for (const corner of order) {
      while (hull.length >= 2 && !turnsLeft(hull[hull.length - 2]!.at, hull[hull.length - 1]!.at, corner.at)) hull.pop();
      hull.push(corner);
    }
    return hull;
  };
  const hull = new Set([...half(corners), ...half([...corners].reverse())]);
  return bridges.filter((candidate) => [...hull].some((corner) => corner.bridge === candidate));
}

/**
 * Eight bridges around a wall end, an octagon that holds the circle of the tolerance around it:
 * what closes an end that walls beyond counting pass. Every ray through that circle is stopped.
 */
function plug(junction: Junction, tolerance: number): WallSegment[] {
  const radius = tolerance / Math.cos(Math.PI / 8);
  const corner = (k: number): Point => ({ x: junction.point.x + Math.cos((k * Math.PI) / 4) * radius, y: junction.point.y + Math.sin((k * Math.PI) / 4) * radius });
  return Array.from({ length: 8 }, (_, k) => bridge(`seal:${junction.ends[0]!.label}:plug${k}`, corner(k), corner(k + 1)));
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
