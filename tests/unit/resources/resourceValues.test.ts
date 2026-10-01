import { describe, expect, it } from 'vitest';
import { clampValue, isDefeated, isSpent, resourceUpdate, startingValue, withCurrent } from '../../../src/app/resources/resourceValues';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';

const drains: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', look: 'bar', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: true };
const fills: ResourceDefinition = { ...drains, key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', defeatedWhenSpent: false };

describe('resource values', () => {
  it('starts draining resources full and filling resources empty', () => {
    expect(startingValue(drains, 8)).toEqual({ current: 8, max: 8 });
    expect(startingValue(fills, 6)).toEqual({ current: 0, max: 6 });
  });

  it('clamps current into 0..max', () => {
    expect(clampValue({ current: 12, max: 8 })).toEqual({ current: 8, max: 8 });
    expect(clampValue({ current: -3, max: 8 })).toEqual({ current: 0, max: 8 });
    expect(withCurrent({ current: 4, max: 8 }, 9)).toEqual({ current: 8, max: 8 });
  });

  it('is spent at 0 when draining and at max when filling', () => {
    expect(isSpent(drains, { current: 0, max: 8 })).toBe(true);
    expect(isSpent(drains, { current: 1, max: 8 })).toBe(false);
    expect(isSpent(fills, { current: 6, max: 6 })).toBe(true);
    expect(isSpent(fills, { current: 0, max: 6 })).toBe(false);
  });

  it('never counts a resource without a maximum as spent', () => {
    expect(isSpent(drains, { current: 0, max: 0 })).toBe(false);
  });

  it('marks a token defeated when a defeating resource is spent', () => {
    expect(isDefeated({ resources: { hp: { current: 0, max: 8 } } }, [drains, fills])).toBe(true);
    expect(isDefeated({ resources: { stress: { current: 6, max: 6 } } }, [drains, fills])).toBe(false);
    expect(isDefeated({}, [drains])).toBe(false);
  });

  it('records a hand-set maximum once and keeps other values', () => {
    const token = { resources: { hp: { current: 5, max: 8 }, str: { current: 12, max: 12 } }, overriddenMax: ['str'] };
    expect(resourceUpdate(token, 'hp', { current: 5, max: 10 }, true)).toEqual({
      resources: { hp: { current: 5, max: 10 }, str: { current: 12, max: 12 } },
      overriddenMax: ['str', 'hp'],
    });
    expect(resourceUpdate(token, 'hp', { current: 3, max: 8 }, false)).toEqual({
      resources: { hp: { current: 3, max: 8 }, str: { current: 12, max: 12 } },
    });
  });
});
