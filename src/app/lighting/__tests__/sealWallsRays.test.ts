import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import { lightReach } from '../../vision/sight';
import { sealWalls } from '../sealWalls';
import { FAMILIES, at, crowds, turn } from './sealFamilies';
import { TOLERANCE, clearOfEnds, random, sealAllPairs, stops, wall, type XY } from './sealFixtures';

/** Some of the walls become doors, open or closed, or one-way walls: what blocks nothing must not be counted on to close a gap. */
function mixed(walls: WallSegment[], rand: () => number): WallSegment[] {
  return walls.map((w) => {
    const kind = rand();
    if (kind < 0.12) return { ...w, type: 'door' as const, closed: false };
    if (kind < 0.2) return { ...w, type: 'door' as const, closed: true };
    if (kind < 0.32) return { ...w, direction: rand() < 0.5 ? 'left' as const : 'right' as const };
    return w;
  });
}

/** The rays from A to B through the junction that all-pairs bridging stops and the capped one lets through. */
function leaks(walls: WallSegment[], rand: () => number, rays: number): { from: XY; to: XY; by: string }[] {
  const capped = sealWalls(walls, TOLERANCE);
  const all = sealAllPairs(walls);
  const found: { from: XY; to: XY; by: string }[] = [];
  for (let i = 0; i < rays; i++) {
    const through = at(turn(rand), Math.sqrt(rand()) * 30);
    const heading = turn(rand);
    const a = at(heading, 14 + rand() * 120, through), b = at(heading + Math.PI, 14 + rand() * 120, through);
    if (!clearOfEnds(a, walls) || !clearOfEnds(b, walls)) continue;
    const stopped = stops(a, b, all);
    if (stopped && !stops(a, b, capped)) found.push({ from: a, to: b, by: stopped.id });
  }
  return found;
}

describe('capped bridging against a bridge for every pair', () => {
  it.each(Object.keys(FAMILIES))('lets no ray through a junction that all pairs would stop: %s', (name) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = random(seed * 7919 + name.length);
      const walls = FAMILIES[name]!(rand);
      expect([name, seed, leaks(walls, rand, 400)]).toEqual([name, seed, []]);
    }
  });

  it.each(Object.keys(FAMILIES))('nor with doors and one-way walls among them: %s', (name) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = random(seed * 104_729 + name.length);
      const walls = mixed(FAMILIES[name]!(rand), rand);
      expect([name, seed, leaks(walls, rand, 400)]).toEqual([name, seed, []]);
    }
  });
});

describe('a wall end that stops short of many walls', () => {
  /**
   * Two rooms with a doorway that a stem all but closes: it ends 10 px short of the south wall,
   * and `dashes` short walls cross it 7 to 9.1 px above its end.
   */
  function ladder(dashes: number): WallSegment[] {
    return [
      wall('north', 300, 300, 700, 300), wall('east', 700, 300, 700, 500), wall('south', 700, 500, 300, 500), wall('west', 300, 500, 300, 300),
      wall('stem', 500, 300, 500, 490),
      ...Array.from({ length: dashes }, (_, i) => wall(`dash${i}`, 470, 483 - i * 0.3, 530, 483 - i * 0.3)),
    ];
  }

  it.each([7, 8, 20])('is bridged to the wall its gap is at, however many others are nearer: %i dashes', (dashes) => {
    const sealed = sealWalls(ladder(dashes), TOLERANCE);
    // From the west room, nothing of the east room is seen, and a torch there lights nothing of it.
    for (const viewer of [{ x: 400, y: 495 }, { x: 320, y: 320 }, { x: 495, y: 497 - 3 }]) {
      const seen = computeVisibility(viewer, 1000, sealed);
      for (let x = 520; x < 700; x += 12) {
        for (let y = 310; y < 500; y += 12) expect([dashes, viewer, x, y, pointInPolygon({ x, y }, seen)]).toEqual([dashes, viewer, x, y, false]);
      }
    }
    expect(pointInPolygon({ x: 690, y: 495 }, lightReach({ x: 400, y: 495 }, 600, sealed).polygon)).toBe(false);
    // Unsealed, the gap is open: the check can fail.
    expect(pointInPolygon({ x: 690, y: 495 }, computeVisibility({ x: 400, y: 495 }, 1000, ladder(dashes)))).toBe(true);
  });
});

describe('a short wall that blocks nothing between two crowded ends', () => {
  const KINDS: [string, Partial<WallSegment>][] = [
    ['an open door', { type: 'door', closed: false }], ['an open secret door', { type: 'secret-door', closed: false }],
    ['a one-way wall', { direction: 'left' }], ['a one-way wall the other way', { direction: 'right' }],
    ['a closed door', { type: 'door', closed: true }], ['a solid wall', {}],
  ];

  it.each(KINDS)('is not counted on to close the gap between them: %s', (_name, between) => {
    for (let seed = 1; seed <= 20; seed++) {
      const walls = crowds(between, seed);
      // Rays from west to east and back through the gap, which a bridge for every pair closes.
      const capped = sealWalls(walls, TOLERANCE);
      const all = sealAllPairs(walls);
      for (let y = 496.5; y <= 503.5; y += 0.5) {
        for (const [a, b] of [[{ x: 440, y }, { x: 560, y: 1000 - y }], [{ x: 560, y }, { x: 440, y: 1000 - y }]] as const) {
          expect(stops(a, b, all)).toBeDefined();
          expect([seed, y, a.x, !!stops(a, b, capped)]).toEqual([seed, y, a.x, true]);
        }
      }
      expect(leaks(walls, random(seed + 99), 300)).toEqual([]);
    }
  });
});
