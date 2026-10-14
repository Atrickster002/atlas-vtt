/**
 * Polygons on a grid of square texels, conservatively: which texels a polygon covers wholly, and
 * which it touches at all. An opening counts only where it covers a texel wholly and floor wherever
 * it touches one, so the raster never shows more below than the polygons do (`openRaster`).
 */

import type { Point } from '../types/visionTypes';

/** A rectangle of texels: columns `x` to `x + columns`, rows `y` to `y + rows`. */
export interface TexelBox {
  x: number;
  y: number;
  columns: number;
  rows: number;
}

/** A polygon on a box of texels: 1 where it covers a texel wholly (`inside`), 1 where it touches one (`touched`). */
export interface PolygonTexels {
  inside: Uint8Array;
  touched: Uint8Array;
}

/** A texel's edge counts as crossed this close, in texels: rounding never lets the boundary slip between two texels. */
const SLACK = 1e-6;

/** The texels of `box` the polygon covers wholly and those it touches, on texels of `texel` world pixels (nonzero rule). */
export function polygonTexels(polygon: readonly Point[], texel: number, box: TexelBox): PolygonTexels {
  const size = box.columns * box.rows;
  const touched = new Uint8Array(size);
  const centred = new Uint8Array(size);
  for (let i = 0; i < polygon.length; i++) markSegment(polygon[i]!, polygon[(i + 1) % polygon.length]!, texel, box, touched);
  fillCentres(polygon, texel, box, centred);
  const inside = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    // A texel no edge touches lies wholly on one side: inside where its centre is.
    inside[i] = centred[i]! && !touched[i] ? 1 : 0;
    if (centred[i]) touched[i] = 1;
  }
  return { inside, touched };
}

/** The box of texels a polygon's bounds touch, within a grid of `columns` × `rows`; null where it lies outside. */
export function polygonBox(polygon: readonly Point[], texel: number, columns: number, rows: number): TexelBox | null {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX / texel - SLACK));
  const y0 = Math.max(0, Math.floor(minY / texel - SLACK));
  const x1 = Math.min(columns, Math.floor(maxX / texel + SLACK) + 1);
  const y1 = Math.min(rows, Math.floor(maxY / texel + SLACK) + 1);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, columns: x1 - x0, rows: y1 - y0 } : null;
}

/** Marks every texel of `box` whose closed square the segment from `a` to `b` meets. */
function markSegment(a: Point, b: Point, texel: number, box: TexelBox, out: Uint8Array): void {
  const dy = b.y - a.y;
  const top = Math.max(box.y, Math.floor(Math.min(a.y, b.y) / texel - SLACK));
  const bottom = Math.min(box.y + box.rows - 1, Math.floor(Math.max(a.y, b.y) / texel + SLACK));
  for (let row = top; row <= bottom; row++) {
    // The part of the segment within the row's band, widened by the slack.
    const y0 = (row - SLACK) * texel;
    const y1 = (row + 1 + SLACK) * texel;
    let from = 0;
    let to = 1;
    if (dy === 0) {
      if (a.y < y0 || a.y > y1) continue;
    } else {
      const t0 = (y0 - a.y) / dy;
      const t1 = (y1 - a.y) / dy;
      from = Math.max(0, Math.min(t0, t1));
      to = Math.min(1, Math.max(t0, t1));
      if (from > to) continue;
    }
    const xa = a.x + (b.x - a.x) * from;
    const xb = a.x + (b.x - a.x) * to;
    const left = Math.max(box.x, Math.floor(Math.min(xa, xb) / texel - SLACK));
    const right = Math.min(box.x + box.columns - 1, Math.floor(Math.max(xa, xb) / texel + SLACK));
    const offset = (row - box.y) * box.columns - box.x;
    for (let column = left; column <= right; column++) out[offset + column] = 1;
  }
}

/** Marks the texels of `box` whose centres the polygon holds, by the nonzero rule. */
function fillCentres(polygon: readonly Point[], texel: number, box: TexelBox, out: Uint8Array): void {
  const crossings: { x: number; winding: number }[] = [];
  for (let row = box.y; row < box.y + box.rows; row++) {
    const y = (row + 0.5) * texel;
    crossings.length = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        crossings.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), winding: a.y < b.y ? 1 : -1 });
      }
    }
    crossings.sort((p, q) => p.x - q.x);
    let winding = 0;
    const offset = (row - box.y) * box.columns - box.x;
    for (let i = 0; i + 1 < crossings.length; i++) {
      winding += crossings[i]!.winding;
      if (winding === 0) continue;
      // Columns whose centre lies in [x_i, x_i+1).
      const first = Math.max(box.x, Math.ceil(crossings[i]!.x / texel - 0.5));
      const last = Math.min(box.x + box.columns, Math.ceil(crossings[i + 1]!.x / texel - 0.5));
      for (let column = first; column < last; column++) out[offset + column] = 1;
    }
  }
}
