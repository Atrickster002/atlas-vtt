import { describe, expect, it } from 'vitest';
import { SHAPE_POOL, drawingBox, hasBristle, paintGeometry, paintImageCount, paintMask, paintStroke, type PaintVariant } from '../../src/app/skin/paint/paintShapes';

/** Every coordinate pair of a path, curve control points included. */
function coordinates(path: string): [number, number][] {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: numbers.length / 2 }, (_, i): [number, number] => [numbers[2 * i]!, numbers[2 * i + 1]!]);
}

const VARIANTS: PaintVariant[] = ['brush-plate', 'key-plate', 'torn-plate', 'torn-note', 'torn-leaf', 'torn-sheet', 'torn-window', 'blotch', 'pebble', 'wash'];
const SIZES = [[36, 36], [120, 32], [420, 260], [1440, 880]] as const;

describe('paintGeometry', () => {
  it('draws the same edge for the same seed and size', () => {
    expect(paintGeometry('torn-sheet', 3, 640, 480)).toBe(paintGeometry('torn-sheet', 3, 640, 480));
    expect(paintGeometry('torn-sheet', 3, 640, 480).path).not.toBe(paintGeometry('torn-sheet', 4, 640, 480).path);
  });

  it.each(VARIANTS)('keeps a %s inside the box its paint layer covers', (variant) => {
    for (const [width, height] of SIZES) {
      for (let seed = 0; seed < SHAPE_POOL; seed++) {
        const { path, viewBox } = paintGeometry(variant, seed, width, height);
        const [minX, minY, w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];
        for (const [x, y] of coordinates(path)) {
          expect(x).toBeGreaterThanOrEqual(minX);
          expect(x).toBeLessThanOrEqual(minX + w + 0.11);
          expect(y).toBeGreaterThanOrEqual(minY);
          expect(y).toBeLessThanOrEqual(minY + h + 0.11);
        }
      }
    }
  });

  it('never tears a window into its own box, so what lies on it is not cut', () => {
    for (const [width, height] of SIZES) {
      const box = drawingBox(width, height);
      for (let seed = 0; seed < SHAPE_POOL; seed++) {
        for (const [x, y] of coordinates(paintGeometry('torn-window', seed, width, height).path)) {
          const inside = x > 0.05 && x < box.width - 0.05 && y > 0.05 && y < box.height - 0.05;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('pulls the paint layer past the element by what the shape reaches out', () => {
    const insets = paintGeometry('torn-sheet', 1, 400, 300).inset.split(' ');
    expect(insets).toHaveLength(4);
    for (const inset of insets) {
      expect(inset).toMatch(/^-\d+\.\d\d%$/);
      expect(Number.parseFloat(inset)).toBeLessThan(0);
      expect(Number.parseFloat(inset)).toBeGreaterThan(-12);
    }
  });

  it('tears a window no deeper than a menu', () => {
    const depth = (width: number, height: number): number => {
      const box = drawingBox(width, height);
      const reach = Math.max(...coordinates(paintGeometry('torn-window', 2, width, height).path).map(([, y]) => -y));
      return (reach / box.height) * height;
    };
    expect(depth(1440, 880)).toBeLessThan(6);
    expect(depth(1440, 880)).toBeLessThan(depth(300, 280) * 1.6);
  });

  it('tears paper in straight pieces and brushes ink in curves', () => {
    expect(paintGeometry('torn-sheet', 1, 400, 300).path).not.toContain('C');
    expect(paintGeometry('brush-plate', 1, 120, 32).path).toContain('C');
  });

  it('runs the bristle of a dry brush through ink, never through paper or a key', () => {
    expect(hasBristle('brush-plate')).toBe(true);
    expect(hasBristle('torn-sheet')).toBe(false);
    expect(hasBristle('key-plate')).toBe(false);
  });
});

describe('the stock of mask images', () => {
  it('draws a control in a box 64 units high and a panel in a taller one', () => {
    expect(drawingBox(192, 64)).toEqual({ width: 192, height: 64 });
    expect(drawingBox(120, 32).height).toBe(64);
    expect(drawingBox(1440, 880).height).toBeGreaterThan(64);
    expect(drawingBox(0, 0)).toEqual({ width: 200, height: 64 });
  });

  it('stays finite however many elements and sizes ask for a shape', () => {
    const before = paintImageCount();
    for (let seed = 0; seed < 500; seed++) {
      for (let width = 100; width < 132; width++) {
        paintMask('key-plate', seed, width, 32);
        paintStroke('key-plate', seed, width, 32);
      }
    }
    // 100 to 131 px at 32 px high lie on three steps of the ratio raster; each has a fill and a line per shape of the stock.
    expect(paintImageCount() - before).toBeLessThanOrEqual(3 * SHAPE_POOL * 2);
  });

  it('gives the fill and its ink line the same silhouette', () => {
    const { path, viewBox } = paintGeometry('torn-note', 7, 240, 120);
    const decode = (image: string): string => decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -2));
    expect(decode(paintMask('torn-note', 7, 240, 120))).toContain(`viewBox="${viewBox}"`);
    expect(decode(paintMask('torn-note', 7, 240, 120))).toContain(path);
    expect(decode(paintStroke('torn-note', 7, 240, 120))).toContain(path);
    expect(decode(paintStroke('torn-note', 7, 240, 120))).toContain('fill="none"');
  });
});
