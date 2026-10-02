import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../types/wallTypes';
import { hasKindLook, kindStrokes } from '../wallKindLook';

const wall = (extra: Partial<WallSegment>): WallSegment => ({ id: 'w', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, ...extra });
/** Lengths of the strokes and of the gaps between them, on screen. */
const onScreen = (strokes: [number, number][], zoom: number): { strokes: number[]; gaps: number[] } => ({
  strokes: strokes.slice(0, -1).map(([from, to]) => Math.round((to - from) * zoom * 100) / 100),
  gaps: strokes.slice(1).map(([from], i) => Math.round((from - strokes[i]![1]) * zoom * 100) / 100),
});

describe('the look of a wall that blocks one thing', () => {
  it('is its own for a wall for sight only and one for light only, and the plain line for a wall for both', () => {
    expect(hasKindLook(wall({}))).toBe(false);
    expect(hasKindLook(wall({ blocks: 'sight' }))).toBe(true);
    expect(hasKindLook(wall({ blocks: 'light', type: 'door', closed: true }))).toBe(true);
    expect(kindStrokes(100, 1, undefined)).toEqual([[0, 100]]);
  });

  it.each([0.25, 1, 4])('keeps its lengths on screen at zoom %f: long dashes for sight, dashes and dots for light', (zoom) => {
    const length = 400 / zoom;
    const sight = onScreen(kindStrokes(length, zoom, 'sight'), zoom);
    expect(new Set(sight.strokes)).toEqual(new Set([12]));
    expect(new Set(sight.gaps)).toEqual(new Set([7]));
    const light = onScreen(kindStrokes(length, zoom, 'light'), zoom);
    expect(new Set(light.strokes)).toEqual(new Set([10, 2]));
    expect(new Set(light.gaps)).toEqual(new Set([4]));
    // The two tell apart by more than their lengths: one has two strokes to a period, the other one.
    expect(light.strokes.slice(0, 4)).toEqual([10, 2, 10, 2]);
  });

  it('ends at the wall\'s end and starts at its first end', () => {
    const strokes = kindStrokes(50, 1, 'sight');
    expect(strokes[0]![0]).toBe(0);
    expect(strokes[strokes.length - 1]![1]).toBeLessThanOrEqual(50);
    expect(strokes.every(([from, to]) => to > from)).toBe(true);
  });

  it('draws a long wall seen from close up with a coarser pattern, not with thousands of strokes', () => {
    const strokes = kindStrokes(8000, 8, 'sight');
    expect(strokes.length).toBeLessThanOrEqual(301);
    expect(strokes.length).toBeGreaterThan(250);
    expect(kindStrokes(8000, 8, 'light').length).toBeLessThanOrEqual(301);
  });

  it('draws nothing strange for a wall without length or a zoom that is none', () => {
    expect(kindStrokes(0, 1, 'sight')).toEqual([[0, 0]]);
    expect(kindStrokes(100, 0, 'sight')).toEqual([[0, 100]]);
    expect(kindStrokes(Number.NaN, 1, 'light')).toEqual([[0, 0]]);
  });
});
