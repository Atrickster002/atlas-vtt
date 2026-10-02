import type { Point } from '../../types/visionTypes';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { blocksFrom } from '../visibility';

/**
 * The rule of limited walls counted by hand, for tests to hold the sweep and the picture
 * against: every wall a straight way crosses, in the order it meets them.
 */

/** Where the way from `from` to `to` meets `wall`, as a share of the way, or null: the closed segment, as the sweep reads it. */
export function meetsAt(from: Point, to: Point, wall: WallSegment): number | null {
  const rx = to.x - from.x, ry = to.y - from.y, ex = wall.p2.x - wall.p1.x, ey = wall.p2.y - wall.p1.y;
  const den = rx * ey - ry * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((wall.p1.x - from.x) * ey - (wall.p1.y - from.y) * ex) / den, u = ((wall.p1.x - from.x) * ry - (wall.p1.y - from.y) * rx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

/** What stands between `from` and `to`: whether a solid wall does, and how many limited walls. */
export function crossedByHand(from: Point, to: Point, walls: readonly WallSegment[], channel?: WallChannel): { solid: boolean; limited: number } {
  let solid = false, limited = 0;
  for (const wall of walls) {
    if (!blocksFrom(wall, from, channel)) continue;
    const t = meetsAt(from, to, wall);
    if (t === null || t > 1) continue;
    if (wall.limited) limited++;
    else solid = true;
  }
  return { solid, limited };
}

/** How far a ray from `from` along `angle` reaches: to the first solid wall or the second limited one, whichever it meets first. */
export function reachByHand(from: Point, angle: number, walls: readonly WallSegment[], channel?: WallChannel): number {
  const to = { x: from.x + Math.cos(angle), y: from.y + Math.sin(angle) };
  const met = walls.filter((wall) => blocksFrom(wall, from, channel)).flatMap((wall) => {
    const t = meetsAt(from, to, wall);
    return t === null ? [] : [{ t, limited: wall.limited === true }];
  }).sort((a, b) => a.t - b.t);
  let limited = 0;
  for (const { t, limited: isLimited } of met) {
    if (!isLimited || ++limited === 2) return t;
  }
  return Infinity;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** Where two walls cross between their ends, or null. */
export function crossingPoint(a: WallSegment, b: WallSegment): Point | null {
  const rx = a.p2.x - a.p1.x, ry = a.p2.y - a.p1.y, sx = b.p2.x - b.p1.x, sy = b.p2.y - b.p1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.p1.x - a.p1.x) * sy - (b.p1.y - a.p1.y) * sx) / den, u = ((b.p1.x - a.p1.x) * ry - (b.p1.y - a.p1.y) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.p1.x + rx * t, y: a.p1.y + ry * t } : null;
}

/** The points a shadow's edge can start from: every wall's ends, and where two walls cross. */
export function turningPoints(walls: readonly WallSegment[]): Point[] {
  const points = walls.flatMap((wall) => [wall.p1, wall.p2]);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const at = crossingPoint(walls[i]!, walls[j]!);
      if (at) points.push(at);
    }
  }
  return points;
}

/** Whether the ray from `from` through `to` passes one of `points` within `clear`: there a hair decides what it crosses. */
export function grazes(from: Point, to: Point, points: readonly Point[], clear: number): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const far = { x: from.x + ((to.x - from.x) / length) * 1e5, y: from.y + ((to.y - from.y) / length) * 1e5 };
  return points.some((point) => distanceToSegment(point, from, far) < clear);
}
