import { describe, it, expect } from 'vitest';
import { getDiceCrit } from '../diceCrit';
import type { RolledDie } from '../diceFormula';
import type { DiceRules } from '../../types/diceRulesTypes';

function die(sides: number, value: number, negative = false): RolledDie {
  return { die: `d${sides}`, value, max: sides, ...(negative && { negative: true as const }) };
}

const D20: DiceRules = { defaultRoll: '1d20', crit: 'natural' };

describe('getDiceCrit', () => {
  it('natural: a 20 on the default d20 is high, a 1 low, whatever the modifier', () => {
    expect(getDiceCrit([die(20, 20)], D20)).toBe('high');
    expect(getDiceCrit([die(20, 1)], D20)).toBe('low');
    expect(getDiceCrit([die(20, 15)], D20)).toBeNull();
  });

  it('only looks at the default dice', () => {
    expect(getDiceCrit([die(6, 6)], D20)).toBeNull();
    // The second d20 of 2d20 is not a default die of a 1d20 rule.
    expect(getDiceCrit([die(20, 10), die(20, 20)], D20)).toBeNull();
    expect(getDiceCrit([die(20, 20, true)], D20)).toBeNull();
    expect(getDiceCrit([die(8, 8), die(20, 20)], D20)).toBe('high');
  });

  it('roll-under: 01 is high and the highest face low', () => {
    const rules: DiceRules = { defaultRoll: '1d100', crit: 'roll-under' };
    expect(getDiceCrit([die(100, 1)], rules)).toBe('high');
    expect(getDiceCrit([die(100, 100)], rules)).toBe('low');
    expect(getDiceCrit([die(100, 50)], rules)).toBeNull();
  });

  it('doubles: matching default dice are high, never low', () => {
    const rules: DiceRules = { defaultRoll: '2d12', crit: 'doubles' };
    expect(getDiceCrit([die(12, 7), die(12, 7)], rules)).toBe('high');
    expect(getDiceCrit([die(12, 1), die(12, 1)], rules)).toBe('high');
    expect(getDiceCrit([die(12, 7), die(12, 3)], rules)).toBeNull();
    expect(getDiceCrit([die(12, 7)], rules)).toBeNull();
  });

  it('none: never critical', () => {
    expect(getDiceCrit([die(20, 20)], { defaultRoll: '1d20', crit: 'none' })).toBeNull();
  });
});
