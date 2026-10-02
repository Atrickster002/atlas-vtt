import { describe, expect, it } from 'vitest';
import { sealWalls, sealedWalls } from '../sealWalls';
import { sealTolerance } from '../lightingConstants';
import { crosses, segOf } from '../segments';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import type { WallSegment } from '../../types/wallTypes';

function wall(id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra };
}

const TOLERANCE = sealTolerance(2);

describe('sealTolerance', () => {
  it('is about 13 px at 2 px texels', () => {
    expect(TOLERANCE).toBeCloseTo(13, 9);
  });
});

describe('sealWalls', () => {
  it('bridges a hand-drawn corner narrower than the tolerance', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 5, 110, 100)];
    const sealed = sealWalls(walls, TOLERANCE);
    expect(sealed).toHaveLength(3);
    expect(sealed[2]).toMatchObject({ type: 'solid', p1: { x: 100, y: 0 }, p2: { x: 110, y: 5 } });
    expect(sealed[2]!.direction).toBeUndefined();
  });

  it('closes the corner for sight', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 5, 110, 100)];
    const inside = { x: 105, y: 50 };
    const behind = { x: 105, y: -20 };
    expect(pointInPolygon(behind, computeVisibility(inside, 500, walls))).toBe(true);
    expect(pointInPolygon(behind, computeVisibility(inside, 500, sealWalls(walls, TOLERANCE)))).toBe(false);
  });

  it('bridges a T-junction that stops short across the wall it meets', () => {
    const tee = wall('t', 50, 50, 50, 8);
    const sealed = sealWalls([wall('a', 0, 0, 100, 0), tee], TOLERANCE);
    expect(sealed).toHaveLength(3);
    const bridge = sealed[2]!;
    expect(bridge.p1).toEqual({ x: 50, y: 8 });
    expect(bridge.p2.x).toBeCloseTo(50, 9);
    expect(bridge.p2.y).toBeLessThan(0);
    expect(crosses(bridge.p1.x, bridge.p1.y, bridge.p2.x, bridge.p2.y, segOf(wall('a', 0, 0, 100, 0)))).toBe(true);
  });

  it('lands a T-junction touching the wall just across it', () => {
    const sealed = sealWalls([wall('a', 0, 0, 100, 0), wall('t', 50, 50, 50, 0)], TOLERANCE);
    expect(sealed).toHaveLength(3);
    expect(sealed[2]!.p2.y).toBeCloseTo(-0.01, 9);
  });

  it('keeps gaps wider than the tolerance open', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 114, 0, 200, 0), wall('t', 150, 50, 150, 14)];
    expect(sealWalls(walls, TOLERANCE)).toEqual(walls);
  });

  it('needs no bridge where ends coincide, nor between the two ends of one short wall', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100), wall('s', 300, 0, 305, 0)];
    expect(sealWalls(walls, TOLERANCE)).toEqual(walls);
  });

  it('leaves the drawn walls exactly as they are', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 102, 3, 102, 100, { direction: 'left' }), wall('d', 50, 60, 50, 4, { type: 'door', closed: false })];
    const sealed = sealWalls(walls, TOLERANCE);
    expect(sealed.slice(0, walls.length)).toEqual(walls);
    expect(sealed.slice(walls.length).every((b) => b.type === 'solid' && b.id.startsWith('seal:'))).toBe(true);
  });

  it('builds one bridge per pair of points, with ids that do not depend on wall order', () => {
    // Chain a-b shares a vertex; c's end is near that vertex: two wall ends, one bridge.
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100), wall('c', 105, -5, 200, -5)];
    const sealed = sealWalls(walls, TOLERANCE);
    const bridges = sealed.slice(walls.length);
    expect(bridges).toHaveLength(1);
    const reversed = sealWalls([...walls].reverse(), TOLERANCE).slice(walls.length);
    expect(reversed.map((b) => b.id)).toEqual(bridges.map((b) => b.id));
  });

  it('is deterministic', () => {
    const walls = Array.from({ length: 40 }, (_, i) => wall(`w${i}`, (i * 37) % 300, (i * 53) % 300, ((i * 37) % 300) + 40, ((i * 53) % 300) + 7));
    expect(sealWalls(walls, TOLERANCE)).toEqual(sealWalls(walls, TOLERANCE));
  });

  it('memoises per walls array and texel', () => {
    const walls = [wall('a', 0, 0, 100, 0), wall('b', 110, 0, 200, 0)];
    expect(sealedWalls(walls, 2)).toBe(sealedWalls(walls, 2));
    expect(sealedWalls(walls, 2)).toHaveLength(3);
    // Coarser texels seal wider gaps.
    expect(sealedWalls([wall('a', 0, 0, 100, 0), wall('b', 120, 0, 200, 0)], 4)).toHaveLength(3);
    expect(sealedWalls([wall('a', 0, 0, 100, 0), wall('b', 120, 0, 200, 0)], 2)).toHaveLength(2);
  });
});

describe('sealWalls with walls far beyond the map', () => {
  /** A room whose corners stop short of each other, with a wall inside that stops short of its north wall. */
  const room = (): WallSegment[] => [
    wall('n', 0, 0, 300, 0), wall('e', 308, 4, 308, 300), wall('s', 300, 306, 0, 306), wall('w', -6, 300, -6, 5), wall('t', 150, 150, 150, 9),
    ...Array.from({ length: 60 }, (_, i) => wall(`p${i}`, 20 + i * 4, 40 + (i % 7) * 30, 23 + i * 4, 52 + (i % 7) * 30)),
  ];
  const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);

  it('seals a room alike with a wall ten million pixels long among its walls, without stepping along it', () => {
    const far = wall('far', -5_000_000, 5_000, 5_000_000, 5_400);
    const expected = bridgesOf(room());
    expect(expected.length).toBeGreaterThanOrEqual(5);

    const started = performance.now();
    const bridges = bridgesOf([...room(), far]);

    expect(performance.now() - started).toBeLessThan(50);
    expect(bridges).toEqual(expected);
  });

  it('still bridges a wall end that stops short of the middle of such a wall', () => {
    const far = wall('far', -5_000_000, -8, 5_000_000, -8);

    const bridges = bridgesOf([wall('n', 0, 0, 300, 0), far]);

    expect(bridges.map((bridge) => bridge.id).sort()).toEqual(['seal:n:p1:far', 'seal:n:p2:far']);
    expect(bridges[0]).toMatchObject({ p1: { x: 0, y: 0 }, p2: { x: 0 } });
    expect(bridges[0]!.p2.y).toBeCloseTo(-8, 1);
  });

  it('stays quick with a hundred such walls, which no grid of points could step along', () => {
    const far = Array.from({ length: 100 }, (_, i) => wall(`far${i}`, -1_150_000, -1_150_000 + i * 70, 1_150_000, 1_150_000 - i * 70));

    const started = performance.now();
    const sealed = sealWalls([...room(), ...far], TOLERANCE);

    expect(performance.now() - started).toBeLessThan(500);
    expect(sealed.length).toBeGreaterThanOrEqual(room().length + 100);
  });

  it.each([
    ['not a number', NaN],
    ['infinite', Infinity],
    ['infinite the other way', -Infinity],
    ['too large to square', 1e200],
  ])('skips a wall with a coordinate that is %s', (_label, value) => {
    const broken = [wall('x1', value, 0, 100, 100), wall('x2', 0, 0, 100, value), wall('x3', value, value, value, value)];

    expect(bridgesOf([...room(), ...broken])).toEqual(bridgesOf(room()));
  });
});

describe('sealWalls with crowded wall ends', () => {
  const bridgesOf = (walls: WallSegment[]): WallSegment[] => sealWalls(walls, TOLERANCE).slice(walls.length);
  /** A seeded random number in [0, 1). */
  function random(seed: number): () => number {
    return () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 4_294_967_296;
    };
  }
  /** Sealing `walls`, the time it took and the bridges it made. */
  function timed(walls: WallSegment[]): { ms: number; bridges: WallSegment[] } {
    const started = performance.now();
    const bridges = bridgesOf(walls);
    return { ms: performance.now() - started, bridges };
  }
  const key = (p: { x: number; y: number }): string => `${p.x},${p.y}`;
  const distinctEnds = (walls: WallSegment[]): number => new Set(walls.flatMap((w) => [key(w.p1), key(w.p2)])).size;

  /** A thousand walls that start within a few pixels of each other and run apart. */
  function pile(): WallSegment[] {
    const rand = random(7);
    return Array.from({ length: 1000 }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const x = 500 + rand() * 6, y = 500 + rand() * 6;
      return wall(`pile${i}`, x, y, x + Math.cos(angle) * 200, y + Math.sin(angle) * 200);
    });
  }
  /** Twenty thousand walls from one point, their far ends a tenth of a pixel apart on a circle. */
  function star(): WallSegment[] {
    return Array.from({ length: 20_000 }, (_, i) => {
      const angle = (i / 20_000) * Math.PI * 2;
      return wall(`ray${i}`, 1000, 1000, 1000 + Math.cos(angle) * 318, 1000 + Math.sin(angle) * 318);
    });
  }
  /** A cave drawn as 19,800 segments of three pixels, in rows three pixels apart. */
  function cave(): WallSegment[] {
    return Array.from({ length: 60 }, (_, row) => Array.from({ length: 330 }, (_, i) => wall(`cave${row}-${i}`, 100 + i * 3, 100 + row * 3 + (i % 2), 103 + i * 3, 100 + row * 3 + ((i + 1) % 2)))).flat();
  }

  it.each([['a pile of a thousand walls', pile], ['twenty thousand walls from one point', star], ['a cave of 19,800 short segments', cave]] as const)('seals %s in under 200 ms, with a number of bridges that grows with the ends, not with their pairs', (_name, make) => {
    const walls = make();
    const { ms, bridges } = timed(walls);
    console.info(`sealWalls, ${_name}: ${walls.length} walls, ${distinctEnds(walls)} ends, ${bridges.length} bridges, ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(200);
    expect(bridges.length).toBeLessThanOrEqual(distinctEnds(walls) * 16);
  });

  /** Every pair of distinct wall ends within the tolerance, of different walls: what sealing bridged before it was capped. */
  function pairs(walls: WallSegment[]): [{ x: number; y: number }, { x: number; y: number }][] {
    const ends = walls.flatMap((w, i) => [{ wall: i, point: w.p1 }, { wall: i, point: w.p2 }]);
    const found = new Map<string, [{ x: number; y: number }, { x: number; y: number }]>();
    for (const a of ends) {
      for (const b of ends) {
        const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
        if (b.wall <= a.wall || distance === 0 || distance > TOLERANCE) continue;
        found.set([key(a.point), key(b.point)].sort().join('|'), [a.point, b.point]);
      }
    }
    return [...found.values()];
  }
  const endBridges = (walls: WallSegment[]): WallSegment[] => bridgesOf(walls).filter((b) => b.id.split(':').length === 5);
  const pairKeys = (list: { p1: { x: number; y: number }; p2: { x: number; y: number } }[]): string[] => list.map((b) => [key(b.p1), key(b.p2)].sort().join('|')).sort();

  it('bridges every pair of ends where no end has more than eight others near it, as before', () => {
    const rand = random(3);
    for (let trial = 0; trial < 40; trial++) {
      // Rooms' worth of junctions: up to five walls end within a few pixels of each of 30 places.
      const walls = Array.from({ length: 30 }, (_, place) => Array.from({ length: 2 + Math.floor(rand() * 4) }, (_, i) => {
        const x = (place % 6) * 150 + 100 + rand() * 8, y = Math.floor(place / 6) * 150 + 100 + rand() * 8;
        const angle = rand() * Math.PI * 2;
        return wall(`t${trial}p${place}w${i}`, x, y, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60);
      })).flat();
      expect(pairKeys(endBridges(walls))).toEqual(pairKeys(pairs(walls).map(([p1, p2]) => ({ p1, p2 }))));
    }
  });

  it('joins every pair of crowded ends by a chain of bridges that stays as near to them as they are to each other', () => {
    const rand = random(11);
    let spared = 0;
    for (let trial = 0; trial < 12; trial++) {
      // Junctions of 9 to 40 walls: more ends than each is bridged to.
      const walls = Array.from({ length: 9 + Math.floor(rand() * 32) }, (_, i) => {
        const x = 400 + rand() * 20, y = 400 + rand() * 20;
        const angle = rand() * Math.PI * 2;
        return wall(`j${trial}w${i}`, x, y, x + Math.cos(angle) * 150, y + Math.sin(angle) * 150);
      });
      const bridges = endBridges(walls);
      const wanted = pairs(walls);
      expect(bridges.length).toBeLessThanOrEqual(wanted.length);
      spared += wanted.length - bridges.length;
      // Only pairs within the tolerance are ever bridged.
      for (const b of bridges) expect(Math.hypot(b.p1.x - b.p2.x, b.p1.y - b.p2.y)).toBeLessThanOrEqual(TOLERANCE);
      const next = new Map<string, { x: number; y: number }[]>();
      for (const b of bridges) {
        next.set(key(b.p1), [...(next.get(key(b.p1)) ?? []), b.p2]);
        next.set(key(b.p2), [...(next.get(key(b.p2)) ?? []), b.p1]);
      }
      for (const [a, b] of wanted) {
        const reach = Math.hypot(a.x - b.x, a.y - b.y) + 1e-9;
        const seen = new Set([key(a)]);
        const queue = [a];
        while (queue.length > 0 && !seen.has(key(b))) {
          for (const p of next.get(key(queue.pop()!)) ?? []) {
            if (seen.has(key(p)) || Math.hypot(p.x - b.x, p.y - b.y) > reach) continue;
            seen.add(key(p));
            queue.push(p);
          }
        }
        expect([trial, key(a), key(b), seen.has(key(b))]).toEqual([trial, key(a), key(b), true]);
      }
    }
    expect(spared).toBeGreaterThan(1000);
  });

  /** A wheel: a closed rim, and spokes from it that stop two to six pixels short of the hub, so short of each other. */
  function wheel(spokes: number, seed: number): WallSegment[] {
    const rand = random(seed);
    const on = (i: number, radius: number): { x: number; y: number } => ({ x: 500 + Math.cos((i / spokes) * Math.PI * 2) * radius, y: 500 + Math.sin((i / spokes) * Math.PI * 2) * radius });
    return Array.from({ length: spokes }, (_, i) => {
      const stop = on(i, 2 + rand() * 4);
      return [wall(`rim${i}`, on(i, 300).x, on(i, 300).y, on(i + 1, 300).x, on(i + 1, 300).y), wall(`spoke${i}`, on(i, 300).x, on(i, 300).y, stop.x, stop.y)];
    }).flat();
  }

  it.each([8, 12, 24, 60])('lets no sight through a junction of %i walls that end within the tolerance of each other', (spokes) => {
    const at = (slice: number, radius: number): { x: number; y: number } => ({ x: 500 + Math.cos(((slice + 0.5) / spokes) * Math.PI * 2) * radius, y: 500 + Math.sin(((slice + 0.5) / spokes) * Math.PI * 2) * radius });
    let seenUnsealed = 0;
    // The largest wheel is looked through from every seventh slice, with fewer hubs: sight through sixty spokes is slow.
    const [seeds, step] = spokes > 24 ? [3, 7] : [12, 1];
    for (let seed = 1; seed <= seeds; seed++) {
      const walls = wheel(spokes, seed);
      const sealed = sealWalls(walls, TOLERANCE);
      // From the middle of a slice, no other slice is seen, near the hub or far from it.
      for (let i = 0; i < spokes; i += step) {
        const viewer = at(i, 150);
        const seen = computeVisibility(viewer, 1000, sealed);
        const open = computeVisibility(viewer, 1000, walls);
        expect(pointInPolygon(at(i, 250), seen)).toBe(true);
        for (let j = 0; j < spokes; j++) {
          if (j === i) continue;
          for (const radius of [60, 150, 250]) {
            if (pointInPolygon(at(j, radius), open)) seenUnsealed++;
            expect([spokes, seed, i, j, radius, pointInPolygon(at(j, radius), seen)]).toEqual([spokes, seed, i, j, radius, false]);
          }
        }
      }
    }
    // Without the bridges the hub is open: the check can fail.
    expect(seenUnsealed).toBeGreaterThan(0);
  });

  it('bridges an end to the eight nearest of the walls whose middle it stops short of', () => {
    // Twenty walls pass within the tolerance of one wall's end, each half a pixel farther.
    const lines = Array.from({ length: 20 }, (_, i) => wall(`line${i}`, 0, 2 + i * 0.5, 400, 2 + i * 0.5));
    const bridges = bridgesOf([wall('post', 200, -100, 200, 0), ...lines]).filter((b) => b.id.startsWith('seal:post:p2:'));
    expect(bridges.map((b) => b.id)).toEqual(Array.from({ length: 8 }, (_, i) => `seal:post:p2:line${i}`));
  });
});
