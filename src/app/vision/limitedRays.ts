import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';

/** The same tolerances as `raySegmentIntersect`: a ray meets a limited wall where it would meet any wall. */
const EPSILON = 1e-10;
/** A ray passes through a wall's end point when it comes this near to it, as a share of the distance (at least of a pixel). */
const TOUCH = 1e-9;
/** Two hits this near to each other along a ray, as a share of the distance, are at one point: walls that meet in a corner. */
const SAME = 1e-7;

/**
 * Where a ray meets a limited wall. `side` is 0 where it crosses the wall between its ends, and
 * where it passes through an end point the side of the ray the wall lies on (1 left, -1 right):
 * a ray through a wall's end crosses it or misses it by a hair, which only its neighbours tell.
 */
export interface LimitedHit {
  t: number;
  wall: WallSegment;
  side: -1 | 0 | 1;
}

/** Where a ray from `origin` along the unit vector (dx, dy) meets `wall`, or null. */
export function limitedHit(origin: Point, dx: number, dy: number, wall: WallSegment): LimitedHit | null {
  const { p1, p2 } = wall;
  const ex = p2.x - p1.x, ey = p2.y - p1.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < EPSILON) return null;
  const t = ((p1.x - origin.x) * ey - (p1.y - origin.y) * ex) / denom;
  const u = ((p1.x - origin.x) * dy - (p1.y - origin.y) * dx) / denom;
  if (t < EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  const [end, other] = u < 0.5 ? [p1, p2] : [p2, p1];
  const off = Math.abs(dx * (end.y - origin.y) - dy * (end.x - origin.x));
  if (off > TOUCH * Math.max(1, t)) return { t, wall, side: 0 };
  const across = dx * (other.y - origin.y) - dy * (other.x - origin.x);
  return { t, wall, side: across > 0 ? 1 : across < 0 ? -1 : 0 };
}

/**
 * Where a ray that met limited walls at `hits` stops: at the second it crosses, with the walls
 * it stops at; null if it crosses fewer than two. The walls are counted in the order the ray
 * meets them. Walls met at one point are a corner: those the ray crosses between their ends
 * count each, and of those that end there, the larger number on one side of the ray. So a
 * corner the ray passes between two walls of counts once, as it does for the rays on either
 * side, and one whose walls both lie on one side counts twice or not at all for those rays and
 * twice for this one, which stops there: a corner is never a hole. Sorts `hits`.
 */
export function secondCrossing(hits: LimitedHit[]): { t: number; walls: WallSegment[] } | null {
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.t - b.t);
  let crossed = 0;
  for (let i = 0; i < hits.length;) {
    const t = hits[i]!.t;
    let through = 0, left = 0, right = 0, j = i;
    for (; j < hits.length && hits[j]!.t - t <= SAME * Math.max(1, t); j++) {
      const { side } = hits[j]!;
      if (side === 0) through++;
      else if (side > 0) left++;
      else right++;
    }
    crossed += through + Math.max(left, right);
    if (crossed >= 2) return { t, walls: hits.slice(i, j).map((hit) => hit.wall) };
    i = j;
  }
  return null;
}
