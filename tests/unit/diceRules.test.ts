import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { DEFAULT_DICE_RULES, collectionDiceRules, isValidDefaultRoll } from '../../src/app/gameSystems/diceRules';
import { parseUserPresets } from '../../src/app/gameSystems/presetValidation';
import { sameSystemRules } from '../../src/app/gameSystems/systemRules';

const cthulhu = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:coc7e')!;

describe('collectionDiceRules', () => {
  it('takes the collection\'s own rules first', () => {
    const own = { defaultRoll: '2d12', crit: 'doubles' as const };
    expect(collectionDiceRules({ dice: own, systemPresetId: cthulhu.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(own);
  });

  it('falls back to the recorded preset, then to the default', () => {
    expect(collectionDiceRules({ systemPresetId: cthulhu.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual({ defaultRoll: '1d100', crit: 'roll-under' });
    expect(collectionDiceRules({ systemPresetId: 'deleted' }, BUILT_IN_SYSTEM_PRESETS)).toEqual(DEFAULT_DICE_RULES);
  });
});

describe('isValidDefaultRoll', () => {
  it('accepts one dice group', () => {
    expect(['1d20', '2d12', 'd100', ' 3d6 '].every(isValidDefaultRoll)).toBe(true);
    expect(['', '1d1', '0d6', '1d20+2', '2d6+1d4', 'd'].some(isValidDefaultRoll)).toBe(false);
  });
});

describe('dice in system rules', () => {
  it('counts missing dice as the default when comparing', () => {
    const { dice, ...withoutDice } = structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules);
    expect(dice).toEqual(DEFAULT_DICE_RULES);
    expect(sameSystemRules(withoutDice, { ...withoutDice, dice: { ...DEFAULT_DICE_RULES } })).toBe(true);
    expect(sameSystemRules(withoutDice, { ...withoutDice, dice: { defaultRoll: '1d20', crit: 'none' } })).toBe(false);
  });

  it('keeps valid dice of stored presets and drops invalid ones', () => {
    const preset = (dice: unknown): unknown => ({
      id: `p-${JSON.stringify(dice)}`,
      name: `P ${JSON.stringify(dice)}`,
      rules: { gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], dice },
    });
    const [valid, badRoll, badRule] = parseUserPresets([
      preset({ defaultRoll: ' 2d12 ', crit: 'doubles' }),
      preset({ defaultRoll: '2d', crit: 'doubles' }),
      preset({ defaultRoll: '1d20', crit: 'sometimes' }),
    ]);
    expect(valid!.rules.dice).toEqual({ defaultRoll: '2d12', crit: 'doubles' });
    expect(badRoll!.rules.dice).toBeUndefined();
    expect(badRule!.rules.dice).toBeUndefined();
  });
});
