import { describe, expect, it } from 'vitest';
import { SHAPE_POOL, paintGeometry, paintImageCount, paintMask, paintOverhang, paintStroke, sizeBucket, type PaintKind } from '../../src/app/skin/paint/paintShapes';

/** Every coordinate pair of a path, curve control points included. */
function coordinates(path: string): [number, number][] {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: numbers.length / 2 }, (_, i): [number, number] => [numbers[2 * i]!, numbers[2 * i + 1]!]);
}

const KINDS: PaintKind[] = ['sheet', 'note', 'key', 'brush'];

describe('paintGeometry', () => {
  it('draws the same edge for the same seed and size', () => {
    expect(paintGeometry('sheet', 3, 640, 480)).toBe(paintGeometry('sheet', 3, 640, 480));
    expect(paintGeometry('sheet', 3, 640, 480).path).not.toBe(paintGeometry('sheet', 4, 640, 480).path);
  });

  it.each(KINDS)('keeps a %s inside what its paint layer covers', (kind) => {
    for (const [width, height] of [[36, 36], [120, 32], [420, 260], [1440, 880]] as const) {
      const out = paintOverhang(kind);
      const w = sizeBucket(width);
      const h = sizeBucket(height);
      for (let seed = 0; seed < SHAPE_POOL; seed++) {
        for (const [x, y] of coordinates(paintGeometry(kind, seed, width, height).path)) {
          expect(x).toBeGreaterThanOrEqual(-out);
          expect(x).toBeLessThanOrEqual(w + out);
          expect(y).toBeGreaterThanOrEqual(-out);
          expect(y).toBeLessThanOrEqual(h + out);
        }
      }
    }
  });

  it('never tears a sheet into its own box, so what lies on it is not cut', () => {
    for (let seed = 0; seed < SHAPE_POOL; seed++) {
      const points = coordinates(paintGeometry('sheet', seed, 600, 400).path);
      const w = sizeBucket(600);
      const h = sizeBucket(400);
      for (const [x, y] of points) {
        const inside = x > 0.05 && x < w - 0.05 && y > 0.05 && y < h - 0.05;
        expect(inside).toBe(false);
      }
    }
  });

  it('keeps the whole edge inside the box of an element that clips', () => {
    for (const kind of KINDS) {
      const w = sizeBucket(300);
      const h = sizeBucket(200);
      expect(paintOverhang(kind, 'in')).toBe(0);
      expect(paintGeometry(kind, 1, 300, 200, 'in').viewBox).toBe(`0 0 ${w} ${h}`);
      for (const [x, y] of coordinates(paintGeometry(kind, 1, 300, 200, 'in').path)) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(w + 0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(h + 0.5);
      }
    }
  });

  it('tears paper in straight pieces and brushes ink in curves', () => {
    expect(paintGeometry('sheet', 1, 400, 300).path).not.toContain('C');
    expect(paintGeometry('brush', 1, 120, 32).path).toContain('C');
  });
});

describe('the stock of mask images', () => {
  it('puts sizes on a raster, fine for controls and coarse for windows', () => {
    expect(sizeBucket(33)).toBe(32);
    expect(sizeBucket(37)).toBe(36);
    expect(sizeBucket(1437)).toBe(1408);
    expect(sizeBucket(1)).toBeGreaterThan(0);
  });

  it('stays finite however many elements and sizes ask for a shape', () => {
    const before = paintImageCount();
    for (let seed = 0; seed < 500; seed++) {
      for (let width = 100; width < 132; width++) {
        paintMask('key', seed, width, 32);
        paintStroke('key', seed, width, 32);
      }
    }
    // 100 to 131 px lie on five steps of the raster; each has a fill and a line per shape of the stock.
    expect(paintImageCount() - before).toBeLessThanOrEqual(5 * SHAPE_POOL * 2);
  });

  it('gives the fill and its ink line the same silhouette', () => {
    const { path, viewBox } = paintGeometry('note', 7, 240, 120);
    const decode = (image: string): string => decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -2));
    expect(decode(paintMask('note', 7, 240, 120))).toContain(`viewBox='${viewBox}'`);
    expect(decode(paintMask('note', 7, 240, 120))).toContain(path);
    expect(decode(paintStroke('note', 7, 240, 120))).toContain(path);
    expect(decode(paintStroke('note', 7, 240, 120))).toContain("fill='none'");
  });
});
