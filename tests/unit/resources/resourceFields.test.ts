import { describe, expect, it } from 'vitest';
import { parseResourceValue, resolveField } from '../../../src/app/resources/resourceFields';

describe('resource fields', () => {
  it('reads dotted paths into objects and lists', () => {
    const creature = { hp: 8, stats: [13, 16, 12], resources: { mana: '5/10' } };
    expect(resolveField(creature, 'hp')).toBe(8);
    expect(resolveField(creature, 'stats.0')).toBe(13);
    expect(resolveField(creature, 'resources.mana')).toBe('5/10');
    expect(resolveField(creature, 'stats.9')).toBeUndefined();
    expect(resolveField(creature, 'missing.path')).toBeUndefined();
    expect(resolveField(creature, '')).toBeUndefined();
  });

  it('parses concrete quantities only', () => {
    expect(parseResourceValue(8)).toEqual({ current: 8, max: 8 });
    expect(parseResourceValue('5/10')).toEqual({ current: 5, max: 10 });
    expect(parseResourceValue('22 (4d8+4)')).toEqual({ current: 22, max: 22 });
    expect(parseResourceValue({ current: 3, max: 6 })).toEqual({ current: 3, max: 6 });
    expect(parseResourceValue('2d6')).toBeNull();
    expect(parseResourceValue('lots')).toBeNull();
    expect(parseResourceValue(-1)).toBeNull();
  });
});
