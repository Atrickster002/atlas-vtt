import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { sealTolerance } from './lightingConstants';

/** A hair past the wall a bridge lands on, so the two cross instead of merely touching. */
const OVERSHOOT = 0.01;

interface End {
  wall: number;
  end: 'p1' | 'p2';
  point: Point;
}

/**
 * Closes the gaps of hand-drawn joints before walls reach light or sight, without moving a
 * wall: every wall end within `tolerance` of another wall's end gets a solid bridge to it, and
 * every wall end within `tolerance` of another wall's middle (and not of its ends) gets a bridge
 * that lands just across it. Returns the walls unchanged followed by the bridges; wider gaps
 * stay open for light and sight alike.
 */
export function sealWalls(walls: readonly WallSegment[], tolerance: number): WallSegment[] {
  const ends: End[] = [];
  walls.forEach((wall, i) => {
    if (!hasLength(wall)) return;
    ends.push({ wall: i, end: 'p1', point: wall.p1 }, { wall: i, end: 'p2', point: wall.p2 });
  });
  const cell = Math.max(tolerance, 1) * 4;
  const grid = new PointGrid<End>(cell);
  for (const end of ends) grid.add(end.point, end);
  return [...walls, ...endBridges(walls, ends, grid, tolerance), ...middleBridges(walls, grid, tolerance)];
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

/** One bridge per pair of nearby ends of different walls; coinciding ends need none. */
function endBridges(walls: readonly WallSegment[], ends: readonly End[], grid: PointGrid<End>, tolerance: number): WallSegment[] {
  const bridges = new Map<string, WallSegment>();
  for (const a of ends) {
    for (const b of grid.near(a.point)) {
      if (b.wall <= a.wall) continue;
      const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
      if (distance === 0 || distance > tolerance) continue;
      const [first, second] = [label(walls, a), label(walls, b)].sort();
      const id = `seal:${first}:${second}`;
      const key = [pointKey(a.point), pointKey(b.point)].sort().join('|');
      const existing = bridges.get(key);
      if (!existing || id < existing.id) bridges.set(key, bridge(id, a.point, b.point));
    }
  }
  return [...bridges.values()];
}

/** Bridges from a wall end across the nearby middle of another wall (a T-junction stopping short). */
function middleBridges(walls: readonly WallSegment[], grid: PointGrid<End>, tolerance: number): WallSegment[] {
  const out: WallSegment[] = [];
  walls.forEach((wall, j) => {
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const len2 = dx * dx + dy * dy;
    if (!hasLength(wall)) return;
    const found = new Set<End>();
    grid.alongSegment(wall.p1, wall.p2, (end) => {
      if (end.wall !== j) found.add(end);
    });
    const bridged = new Set<string>();
    for (const end of [...found].sort((a, b) => a.wall - b.wall || a.end.localeCompare(b.end))) {
      const p = end.point;
      if (bridged.has(pointKey(p))) continue;
      if (Math.hypot(p.x - wall.p1.x, p.y - wall.p1.y) <= tolerance || Math.hypot(p.x - wall.p2.x, p.y - wall.p2.y) <= tolerance) continue;
      const u = ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / len2;
      if (u <= 0 || u >= 1) continue;
      const foot = { x: wall.p1.x + dx * u, y: wall.p1.y + dy * u };
      if (Math.hypot(p.x - foot.x, p.y - foot.y) > tolerance) continue;
      const across = acrossDirection(p, foot, walls[end.wall]![end.end === 'p1' ? 'p2' : 'p1'], dx, dy);
      const landing = { x: foot.x + across.x * OVERSHOOT, y: foot.y + across.y * OVERSHOOT };
      out.push(bridge(`seal:${label(walls, end)}:${wall.id}`, p, landing));
      bridged.add(pointKey(p));
    }
  });
  return out;
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

function label(walls: readonly WallSegment[], end: End): string {
  return `${walls[end.wall]!.id}:${end.end}`;
}

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function bridge(id: string, p1: Point, p2: Point): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { ...p1 }, p2: { ...p2 } };
}

/** Points binned in square cells at least `tolerance` wide, so neighbours are one cell away. */
class PointGrid<T> {
  private readonly cells = new Map<number, T[]>();
  /** Every cell that holds an item, for walking the cells instead of a segment. */
  private readonly occupied: Array<{ cx: number; cy: number; items: T[] }> = [];

  constructor(private readonly size: number) {}

  add(p: Point, item: T): void {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size);
    const key = this.key(cx, cy);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(item);
      return;
    }
    const items = [item];
    this.cells.set(key, items);
    this.occupied.push({ cx, cy, items });
  }

  /** Items in the cells around `p`: every item within a cell width of it, and some more. */
  near(p: Point): T[] {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size);
    const out: T[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) out.push(...(this.cells.get(this.key(cx + dx, cy + dy)) ?? []));
    }
    return out;
  }

  /**
   * Visits items in the cells around a segment: samples a cell width apart, each with its
   * neighbours, cover every point within a quarter cell of the segment.
   */
  alongSegment(a: Point, b: Point, visit: (item: T) => void): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / this.size));
    // A segment far longer than the map (a damaged or foreign file) would be sampled without end
    if (steps > this.occupied.length) {
      this.cellsNear(a, b, visit);
      return;
    }
    const seen = new Set<number>();
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps, y = a.y + ((b.y - a.y) * s) / steps;
      const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = this.key(cx + dx, cy + dy);
          if (seen.has(key)) continue;
          seen.add(key);
          for (const item of this.cells.get(key) ?? []) visit(item);
        }
      }
    }
  }

  /**
   * Visits the items the samples of `alongSegment` would reach, by walking the cells that hold
   * items instead of the segment: a sample reaches the cells around its own, whose centres lie
   * within one and a half cells of it on each axis.
   */
  private cellsNear(a: Point, b: Point, visit: (item: T) => void): void {
    const reach = this.size * 1.5 * Math.SQRT2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    for (const { cx, cy, items } of this.occupied) {
      const x = (cx + 0.5) * this.size, y = (cy + 0.5) * this.size;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
      if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) > reach) continue;
      for (const item of items) visit(item);
    }
  }

  private key(cx: number, cy: number): number {
    // Colliding keys only add candidates; every caller checks the distance.
    return cx * 73_856_093 + cy;
  }
}
