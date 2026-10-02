import type { Graphics } from 'pixi.js';
import type { WallSegment } from '../../types/wallTypes';

/**
 * How the wall editor draws a wall that is not a plain wall. A wall for both is a plain line;
 * one for sight only is long dashes, one for light only dashes and dots in turn; a limited wall
 * is a row of dots, in the groups of its dashes where it blocks one thing only (threes for
 * sight, a pair and a single dot for light). The lengths are screen pixels, so the look reads
 * the same at any zoom, and each stroke lies on a dark casing, so it shows on a pale map as on
 * a dark one.
 */

/** Strokes and gaps in turn, in screen pixels. */
const PATTERNS = { sight: [12, 7], light: [10, 4, 2, 4] } as const;
/** Width of the line on screen, and how far its casing shows on either side. */
const WIDTH = 3;
const CASING = 1.25;
/** The most strokes one wall is drawn with: a long wall seen from close up gets a coarser pattern instead of thousands. */
const MAX_STROKES = 300;
/** A limited wall's dots: how far apart on screen, and their radius. */
const DOT_STEP = 4.5;
const DOT_RADIUS = 1.6;
const MAX_DOTS = 600;

/** Whether the wall has a look of its own: the plain line is drawn by the wall renderer. */
export function hasKindLook(wall: WallSegment): boolean {
  return wall.blocks !== undefined || wall.limited === true;
}

/**
 * The strokes of a wall of `length` world pixels at `zoom` screen pixels per world pixel, as
 * distances from its first end: the pattern of what it blocks, laid out from that end.
 */
export function kindStrokes(length: number, zoom: number, blocks: WallSegment['blocks']): [from: number, to: number][] {
  if (!blocks || !(length > 0) || !(zoom > 0)) return [[0, length > 0 ? length : 0]];
  const pattern = PATTERNS[blocks];
  const period = pattern.reduce((sum, part) => sum + part, 0);
  // Screen pixels to world pixels, coarser where the wall would take too many strokes.
  const scale = Math.max(1 / zoom, (length * pattern.length) / (2 * period * MAX_STROKES));
  const strokes: [number, number][] = [];
  let at = 0;
  for (let i = 0; at < length; i++) {
    const part = pattern[i % pattern.length]! * scale;
    if (i % 2 === 0) strokes.push([at, Math.min(at + part, length)]);
    at += part;
  }
  return strokes;
}

/**
 * The dots of a limited wall, as distances from its first end: spread evenly over each stroke
 * of what it blocks, `DOT_STEP` screen pixels apart, one at least to a stroke.
 */
export function kindDots(length: number, zoom: number, blocks: WallSegment['blocks'], limited = true): number[] {
  if (!limited || !(length > 0) || !(zoom > 0)) return [];
  const step = Math.max(DOT_STEP / zoom, length / MAX_DOTS);
  return kindStrokes(length, zoom, blocks).flatMap(([from, to]) => {
    const count = Math.max(1, Math.round((to - from) / step));
    return Array.from({ length: count }, (_, i) => from + ((i + 0.5) * (to - from)) / count);
  });
}

/** Draws `wall` in the look of its kind, in `color`, at `zoom` screen pixels per world pixel. */
export function drawKindWall(g: Graphics, wall: WallSegment, color: number, zoom: number, alpha = 1): void {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return;
  const at = (d: number): [number, number] => [wall.p1.x + (dx / length) * d, wall.p1.y + (dy / length) * d];
  if (wall.limited) {
    const dots = kindDots(length, zoom, wall.blocks);
    for (const d of dots) g.circle(...at(d), (DOT_RADIUS + CASING) / zoom);
    g.fill({ color: 0x000000, alpha: 0.55 * alpha });
    for (const d of dots) g.circle(...at(d), DOT_RADIUS / zoom);
    g.fill({ color, alpha });
    return;
  }
  const strokes = kindStrokes(length, zoom, wall.blocks);
  const path = (): void => {
    for (const [from, to] of strokes) {
      g.moveTo(...at(from));
      g.lineTo(...at(to));
    }
  };
  path();
  g.stroke({ width: (WIDTH + 2 * CASING) / zoom, color: 0x000000, alpha: 0.55 * alpha });
  path();
  g.stroke({ width: WIDTH / zoom, color, alpha });
}

/** A dashed line in world pixels: a wall not placed yet, a secret door. */
export function drawDashedLine(
  g: Graphics,
  x1: number, y1: number,
  x2: number, y2: number,
  color: number, width: number,
  dashLength: number, gapLength: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const nx = dx / dist;
  const ny = dy / dist;

  let pos = 0;
  let drawing = true;
  while (pos < dist) {
    const segLen = drawing ? dashLength : gapLength;
    const end = Math.min(pos + segLen, dist);
    if (drawing) {
      g.moveTo(x1 + nx * pos, y1 + ny * pos);
      g.lineTo(x1 + nx * end, y1 + ny * end);
      g.stroke({ width, color });
    }
    pos = end;
    drawing = !drawing;
  }
}
