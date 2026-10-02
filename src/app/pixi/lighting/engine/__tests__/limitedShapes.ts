import type { WallSegment } from '../../../../types/wallTypes';
import type { P } from './fuzzRooms';

/** Walls around the middle of a 2048 px map, and where lights and tokens may stand. */
export interface Shape {
  walls: WallSegment[];
  /** Places for a light with a token: clear of every wall. */
  places: P[];
}

export const MIDDLE = 1024;
let id = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment => ({ id: `s${id++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra });
const hedge = (x1: number, y1: number, x2: number, y2: number): WallSegment => wall(x1, y1, x2, y2, { limited: true });

function distance(p: P, w: WallSegment): number {
  const dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y;
  const t = Math.max(0, Math.min(1, ((p[0] - w.p1.x) * dx + (p[1] - w.p1.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - w.p1.x - dx * t, p[1] - w.p1.y - dy * t);
}

/** Up to `count` places around the middle, at least 40 px from every wall. */
function placesAround(walls: readonly WallSegment[], rand: () => number, count: number, near = 200, far = 480): P[] {
  const places: P[] = [];
  for (let attempt = 0; attempt < 60 && places.length < count; attempt++) {
    const angle = rand() * Math.PI * 2, reach = near + rand() * (far - near);
    const p: P = [MIDDLE + Math.cos(angle) * reach, MIDDLE + Math.sin(angle) * reach];
    if (walls.every((w) => distance(p, w) > 40)) places.push(p);
  }
  return places;
}

/** A wall through a point near the middle, at any angle. */
function through(rand: () => number, limited: boolean): WallSegment {
  const x = MIDDLE + (rand() - 0.5) * 120, y = MIDDLE + (rand() - 0.5) * 120, angle = rand() * Math.PI, half = 150 + rand() * 200;
  return wall(x - Math.cos(angle) * half, y - Math.sin(angle) * half, x + Math.cos(angle) * half, y + Math.sin(angle) * half, limited ? { limited: true } : {});
}

/** Two to four hedges that cross each other between their ends, and now and then a solid wall across them. */
export function crossingHedges(rand: () => number): Shape {
  const walls = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => through(rand, true));
  if (rand() < 0.3) walls.push(through(rand, false));
  return { walls, places: placesAround(walls, rand, 2) };
}

export const SHAPES = { crossingHedges } as const;
export type ShapeName = keyof typeof SHAPES;
export { hedge, wall, placesAround };
