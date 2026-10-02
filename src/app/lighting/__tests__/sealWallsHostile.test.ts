import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { sealWalls } from '../sealWalls';
import { TOLERANCE, key, random, wall } from './sealFixtures';

/**
 * Inputs made to be slow: ends along a diagonal, where no box around them tells one direction
 * from the next, and strokes side by side, whose points come as sorted runs. A foreign or
 * damaged map may hold them, and a map must open all the same.
 */
const SQRT2 = Math.SQRT2;
type Maker = () => WallSegment[];

/** `count` walls with both ends on the line through (500, 500) along (1, `slope`), within `span` px of it. */
const onLine = (count: number, span: number, slope: number) => (): WallSegment[] => {
  const rand = random(17);
  const at = (t: number): [number, number] => [500 + t / SQRT2, 500 + (t / SQRT2) * slope];
  return Array.from({ length: count }, (_, i) => wall(`d${i}`, ...at(rand() * span), ...at(rand() * span)));
};

/** A chain of `count` segments along the line through (cx, cy) along (1, `slope`), `span` px long. */
function chain(name: string, count: number, span: number, slope: number, cx = 500, cy = 500): WallSegment[] {
  const at = (i: number): [number, number] => [cx + ((i / count - 0.5) * span) / SQRT2, cy + (((i / count - 0.5) * span) / SQRT2) * slope];
  return Array.from({ length: count }, (_, i) => wall(`${name}${i}`, ...at(i), ...at(i + 1)));
}

/** Steps of a thousandth of a pixel, right and down in turn. */
function staircase(): WallSegment[] {
  return Array.from({ length: 20_000 }, (_, i) => {
    const [x, y] = [500 + Math.ceil(i / 2) * 0.001, 500 + Math.floor(i / 2) * 0.001];
    return i % 2 ? wall(`step${i}`, x, y, x, y + 0.001) : wall(`step${i}`, x, y, x + 0.001, y);
  });
}

const HOSTILE: [string, Maker][] = [
  ['both ends of 20,000 walls on one diagonal in nine pixels', onLine(20_000, 9, 1)],
  ['the same on the other diagonal', onLine(20_000, 9, -1)],
  ['the same on a line a millionth off the diagonal', onLine(20_000, 9, 1.000001)],
  ['a staircase of 20,000 steps along a diagonal', staircase],
  ['one chain of 60,000 segments on a diagonal in twelve pixels', () => chain('c', 60_000, 12, 1)],
  ['two chains of 30,000 crossing as an X', () => [...chain('a', 30_000, 12, 1), ...chain('b', 30_000, 12, -1)]],
  // Two sorted runs one after the other: the tree's quickselect took the middle point as its pivot, the least of what was left each time.
  ['two strokes of 90,000 segments side by side', () => [...chain('a', 90_000, 5000, 0, 2500, 500), ...chain('b', 90_000, 5000, 0, 2500, 520)]],
];

describe('sealWalls on hostile input', () => {
  const places = (walls: WallSegment[]): number => new Set(walls.flatMap((w) => [key(w.p1), key(w.p2)])).size;

  it.each(HOSTILE)('seals %s in a second or so, with a bounded number of bridges', { timeout: 300_000 }, (name, make) => {
    const walls = make();
    const started = performance.now();
    const bridges = sealWalls(walls, TOLERANCE).length - walls.length;
    const ms = performance.now() - started;
    console.info(`sealWalls, ${name}: ${walls.length} walls, ${places(walls)} places, ${bridges} bridges, ${ms.toFixed(0)} ms`);
    // Under a second each on the machine this was written on, run alone; the bound leaves room for a loaded one.
    expect(ms).toBeLessThan(3000);
    // At most eight bridges are begun at a place, eight more to the far ends of walls on their own, and sixteen across the walls that pass it.
    expect(bridges).toBeLessThanOrEqual(places(walls) * 32);
    expect(bridges).toBeLessThan(700_000);
  });
});
