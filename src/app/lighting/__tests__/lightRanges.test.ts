import { describe, expect, it } from 'vitest';
import { gameUnitsToWorld, worldToGameUnits } from '../lightingUnits';
import { LIGHT_PRESETS } from '../lightPresets';
import { dragRange, formatRange, rangeSliderScale } from '../lightRanges';

const torch = LIGHT_PRESETS.torch.emission; // bright 20, dim 40

describe('dragRange', () => {
  it('snaps a dragged ring to whole game units', () => {
    expect(dragRange(torch, 'bright', 12.4, false).bright).toBe(12);
    expect(dragRange(torch, 'dim', 47.6, false).dim).toBe(48);
  });

  it('keeps tenths while Alt is held', () => {
    expect(dragRange(torch, 'bright', 12.44, true).bright).toBe(12.4);
    expect(dragRange(torch, 'dim', 47.66, true).dim).toBe(47.7);
  });

  it('never leaves dim below bright: the bright ring pushes the dim ring out', () => {
    expect(dragRange(torch, 'bright', 55.2, false)).toMatchObject({ bright: 55, dim: 55 });
  });

  it('never leaves dim below bright: the dim ring pulls the bright ring in', () => {
    expect(dragRange(torch, 'dim', 8.3, false)).toMatchObject({ bright: 8, dim: 8 });
  });

  it('stops at the light itself', () => {
    expect(dragRange(torch, 'bright', -4, false).bright).toBe(0);
  });

  it('returns the same emission while the ring stays on its unit', () => {
    expect(dragRange(torch, 'bright', 20.3, false)).toBe(torch);
  });
});

describe('range units', () => {
  const scale = { unitDistance: 5, cellSize: 70 };

  it('converts world pixels back to the game units they were drawn from', () => {
    expect(worldToGameUnits(gameUnitsToWorld(20, scale), scale)).toBeCloseTo(20);
    expect(worldToGameUnits(140, scale)).toBe(10);
  });

  it('shows whole ranges plainly and others with one decimal', () => {
    expect(formatRange(20)).toBe('20');
    expect(formatRange(12.44)).toBe('12.4');
  });
});

describe('rangeSliderScale', () => {
  it('spans 24 cells in whole units on a 5 ft grid', () => {
    expect(rangeSliderScale(5, 40)).toEqual({ max: 120, step: 1 });
  });

  it('steps by half units where a cell spans less than two', () => {
    expect(rangeSliderScale(1.5, 9)).toEqual({ max: 36, step: 0.5 });
  });

  it('grows with a light that reaches further', () => {
    expect(rangeSliderScale(5, 300).max).toBe(300);
    expect(rangeSliderScale(1.5, 40.2).max).toBe(40.5);
  });
});
