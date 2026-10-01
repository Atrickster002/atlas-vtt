import { describe, expect, it } from 'vitest';
import { wheelArcs } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';

const TOP = -Math.PI / 2;
const TURN = Math.PI * 2;

describe('wheelArcs', () => {
  it('draws one segment per point up to a maximum of eight, lit clockwise from the top', () => {
    const arcs = wheelArcs({ current: 4, max: 6 });
    expect(arcs).toHaveLength(6);
    expect(arcs.map((arc) => arc.lit)).toEqual([true, true, true, true, false, false]);
    expect(arcs[0]!.start).toBeGreaterThan(TOP);
    expect(arcs[0]!.start).toBeLessThan(arcs[0]!.end);
    expect(arcs[5]!.end).toBeLessThan(TOP + TURN);
  });

  it('draws a lit arc and the rest for larger or fractional maximums', () => {
    const [lit, rest] = wheelArcs({ current: 30, max: 120 });
    expect(lit).toEqual({ start: TOP, end: TOP + TURN / 4, lit: true });
    expect(rest).toEqual({ start: TOP + TURN / 4, end: TOP + TURN, lit: false });
  });

  it('draws a single arc when empty or full, and nothing without a maximum', () => {
    expect(wheelArcs({ current: 0, max: 20 })).toEqual([{ start: TOP, end: TOP + TURN, lit: false }]);
    expect(wheelArcs({ current: 20, max: 20 })).toEqual([{ start: TOP, end: TOP + TURN, lit: true }]);
    expect(wheelArcs({ current: 1, max: 1 })).toEqual([{ start: TOP, end: TOP + TURN, lit: true }]);
    expect(wheelArcs({ current: 0, max: 0 })).toEqual([]);
  });
});
