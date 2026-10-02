import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../vision/visibility';
import { lightReach } from '../../vision/sight';
import { sealWalls } from '../sealWalls';
import { TOLERANCE, clearOfEnds, random, sealAllPairs, stops, wall, type XY } from './sealFixtures';

const C = { x: 500, y: 500 };
const at = (angle: number, radius: number, from: XY = C): XY => ({ x: from.x + Math.cos(angle) * radius, y: from.y + Math.sin(angle) * radius });
const turn = (rand: () => number): number => rand() * Math.PI * 2;
type Family = (rand: () => number) => WallSegment[];

/** A wall from `p` running `length` away from the junction, or in a direction of its own. */
function from(id: string, p: XY, rand: () => number, length = 60 + rand() * 140, angle = Math.atan2(p.y - C.y, p.x - C.x) + (rand() - 0.5)): WallSegment {
  const q = at(angle, length, p);
  return wall(id, p.x, p.y, q.x, q.y);
}

/** Junctions of many walls, each kind crowded in its own way; every family has more ends or walls in one place than an end is bridged to. */
const FAMILIES: Record<string, Family> = {
  // Ends on a small circle, their walls running outward.
  ring: (rand) => {
    const n = 9 + Math.floor(rand() * 40), radius = 2 + rand() * 9;
    return Array.from({ length: n }, (_, i) => from(`r${i}`, at((i / n) * Math.PI * 2 + rand() * 0.1, radius), rand));
  },
  // Two crowds of ends, 8 to 22 px apart.
  twoClusters: (rand) => {
    const other = at(turn(rand), 8 + rand() * 14);
    return Array.from({ length: 12 + Math.floor(rand() * 40) }, (_, i) => from(`c${i}`, at(turn(rand), rand() * 5, i % 2 ? other : C), rand, undefined, turn(rand)));
  },
  // Ends in a row, one to three pixels apart.
  line: (rand) => {
    const along = turn(rand);
    return Array.from({ length: 10 + Math.floor(rand() * 40) }, (_, i) => from(`l${i}`, at(along, i * (1 + rand() * 2) - 20), rand, undefined, along + Math.PI / 2 + (rand() - 0.5) * 0.6 + (i % 2 ? Math.PI : 0)));
  },
  // One end, and every other end in one eighth of the directions around it.
  octant: (rand) => {
    const towards = turn(rand);
    return [from('o', C, rand, undefined, towards + Math.PI), ...Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`o${i}`, at(towards + (rand() - 0.5) * 0.7, 1 + rand() * 12), rand, undefined, towards + (rand() - 0.5) * 2))];
  },
  // Ends anywhere in a disc of the tolerance, walls running any way.
  blob: (rand) => Array.from({ length: 9 + Math.floor(rand() * 52) }, (_, i) => from(`b${i}`, at(turn(rand), Math.sqrt(rand()) * 12), rand, undefined, turn(rand))),
  // A blob with a long wall through it.
  through: (rand) => {
    const along = turn(rand), off = at(along + Math.PI / 2, (rand() - 0.5) * 10);
    const a = at(along, 300, off), b = at(along + Math.PI, 300, off);
    return [wall('long', a.x, a.y, b.x, b.y), ...Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`t${i}`, at(turn(rand), Math.sqrt(rand()) * 12), rand, undefined, turn(rand)))];
  },
  // Walls of 3 to 25 px with both ends in the crowd.
  shortWalls: (rand) => Array.from({ length: 9 + Math.floor(rand() * 40) }, (_, i) => from(`s${i}`, at(turn(rand), Math.sqrt(rand()) * 14), rand, 3 + rand() * 22, turn(rand))),
  // Freehand strokes: chains of short segments that share their corners, crossing near each other.
  stroke: (rand) => Array.from({ length: 3 }, (_, s) => {
    let p = at(turn(rand), 30 + rand() * 20);
    let heading = Math.atan2(C.y - p.y, C.x - p.x) + (rand() - 0.5) * 0.5;
    return Array.from({ length: 20 + Math.floor(rand() * 20) }, (_, i) => {
      heading += (rand() - 0.5) * 0.8;
      const q = at(heading, 2 + rand() * 5, p);
      const segment = wall(`k${s}-${i}`, p.x, p.y, q.x, q.y);
      p = q;
      return segment;
    });
  }).flat(),
  // One wall's end with many long walls passing it within the tolerance, and a few more ends beside it.
  passing: (rand) => {
    const stem = from('stem', C, rand, 150, turn(rand));
    const passing = Array.from({ length: 9 + Math.floor(rand() * 52) }, (_, i) => {
      const towards = turn(rand), foot = at(towards, 0.5 + rand() * 12.4);
      const a = at(towards + Math.PI / 2, 40 + rand() * 200, foot), b = at(towards - Math.PI / 2, 40 + rand() * 200, foot);
      return wall(`m${i}`, a.x, a.y, b.x, b.y);
    });
    return [stem, ...passing, ...Array.from({ length: Math.floor(rand() * 4) }, (_, i) => from(`e${i}`, at(turn(rand), rand() * 12), rand, undefined, turn(rand)))];
  },
  // A wall that ends short of another, with many short walls crossing it nearer to its end than that one is.
  ladder: (rand) => {
    const along = turn(rand), gap = 4 + rand() * 8.9;
    const far = at(along, gap), a = at(along + Math.PI / 2, 250, far), b = at(along - Math.PI / 2, 250, far);
    const back = at(along + Math.PI, 180);
    return [wall('stem', back.x, back.y, C.x, C.y), wall('far', a.x, a.y, b.x, b.y), ...Array.from({ length: 8 + Math.floor(rand() * 40) }, (_, i) => {
      const foot = at(along + Math.PI, 0.5 + rand() * (gap - 1));
      const c = at(along + Math.PI / 2, 15 + rand() * 40, foot), d = at(along - Math.PI / 2, 15 + rand() * 40, foot);
      return wall(`d${i}`, c.x, c.y, d.x, d.y);
    })];
  },
  // The same with the nearer walls at any angle on one side of the end, and the far one on the other.
  oneSide: (rand) => {
    const along = turn(rand), gap = 6 + rand() * 6.9;
    const far = at(along, gap), a = at(along + Math.PI / 2, 250, far), b = at(along - Math.PI / 2, 250, far);
    const back = at(along + Math.PI, 180);
    return [wall('stem', back.x, back.y, C.x, C.y), wall('far', a.x, a.y, b.x, b.y), ...Array.from({ length: 8 + Math.floor(rand() * 40) }, (_, i) => {
      const towards = along + Math.PI + (rand() - 0.5) * 2.2, foot = at(towards, 0.5 + rand() * (gap - 1));
      const c = at(towards + Math.PI / 2, 14 + rand() * 30, foot), d = at(towards - Math.PI / 2, 14 + rand() * 30, foot);
      return wall(`n${i}`, c.x, c.y, d.x, d.y);
    })];
  },
};

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
