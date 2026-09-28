import { describe, it, expect } from 'vitest';
import { fadeAlphaAt, radialFadeGroups } from '../../src/app/pixi/radialFade';

const STOPS = [
  { radius: 10, alpha: 1 },
  { radius: 20, alpha: 0 },
];

describe('fadeAlphaAt', () => {
  it('holds the first stop inside it and the last beyond it', () => {
    expect(fadeAlphaAt(STOPS, 0)).toBe(1);
    expect(fadeAlphaAt(STOPS, 50)).toBe(0);
  });

  it('interpolates between stops', () => {
    expect(fadeAlphaAt(STOPS, 15)).toBeCloseTo(0.5, 9);
  });
});

describe('radialFadeGroups', () => {
  it('cuts a line into pieces, groups them by opacity and drops invisible ones', () => {
    const groups = radialFadeGroups([{ x1: 0, y1: 0, x2: 30, y2: 0 }], STOPS, 1, 10);
    const pieces = groups.flatMap(group => group.pieces);

    // Pieces with a midpoint past 19.5 round to zero and are dropped.
    expect(Math.max(...pieces.map(piece => piece.x2))).toBe(20);
    expect(pieces).toHaveLength(20);
    // Up to 10.5 the rounded opacity is still full.
    expect(groups.find(group => group.alpha === 1)?.pieces).toHaveLength(11);
    for (const { alpha, pieces: inGroup } of groups) {
      for (const piece of inGroup) {
        expect(Math.round(fadeAlphaAt(STOPS, (piece.x1 + piece.x2) / 2) * 10) / 10).toBe(alpha);
      }
    }
  });
});
