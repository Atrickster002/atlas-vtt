import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { DEFAULT_DICE_RULES, collectionDiceRules, isValidDefaultRoll, parseExplodeRule, sameDiceRules, withExplodeScope } from '../../src/app/gameSystems/diceRules';
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

describe('exploding dice rules', () => {
  const aces = { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 } as const;

  it('reads a stored rule and drops what is no rule', () => {
    expect(parseExplodeRule(aces)).toEqual(aces);
    expect(parseExplodeRule({ dice: 'default', repeats: false, highFaces: 2, lowFaces: 1, more: true })).toEqual({ dice: 'default', repeats: false, highFaces: 2, lowFaces: 1 });
    for (const broken of [undefined, null, 'all', { ...aces, dice: 'some' }, { ...aces, repeats: 'yes' }, { ...aces, highFaces: 0 }, { ...aces, highFaces: 1.5 }, { ...aces, lowFaces: -1 }]) {
      expect(parseExplodeRule(broken)).toBeNull();
    }
  });

  it('compares dice rules by their exploding rule too', () => {
    const base = { defaultRoll: '1d10', crit: 'natural' as const };
    expect(sameDiceRules(base, { ...base })).toBe(true);
    expect(sameDiceRules(base, { ...base, explode: aces })).toBe(false);
    expect(sameDiceRules({ ...base, explode: { ...aces } }, { ...base, explode: aces })).toBe(true);
    expect(sameDiceRules({ ...base, explode: { ...aces, repeats: false } }, { ...base, explode: aces })).toBe(false);
  });

  it('keeps the exploding rule of a stored preset and drops a broken one', () => {
    const preset = (dice: unknown): unknown => ({ id: 'user-1', name: 'Mine', rules: { ...structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules), dice } });
    const [kept] = parseUserPresets([preset({ defaultRoll: '1d8', crit: 'none', explode: aces })]);
    expect(kept?.rules.dice).toEqual({ defaultRoll: '1d8', crit: 'none', explode: aces });
    const [dropped] = parseUserPresets([preset({ defaultRoll: '1d8', crit: 'none', explode: { dice: 'all' } })]);
    expect(dropped?.rules.dice).toEqual({ defaultRoll: '1d8', crit: 'none' });
  });

  it('switches exploding on with the default rule, keeps a rule\'s settings and removes it when off', () => {
    const base = { defaultRoll: '1d10', crit: 'natural' as const };
    expect(withExplodeScope(base, 'all')).toEqual({ ...base, explode: aces });
    const once = { ...base, explode: { dice: 'all', repeats: false, highFaces: 2, lowFaces: 1 } as const };
    expect(withExplodeScope(once, 'default').explode).toEqual({ ...once.explode, dice: 'default' });
    expect(withExplodeScope(once, 'off')).toEqual(base);
    expect('explode' in withExplodeScope(once, 'off')).toBe(false);
  });

  it('sets Cyberpunk RED to explode its check die once, up on a 10 and down on a 1', () => {
    const red = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cyberpunk RED')!;
    expect(red.rules.dice?.explode).toEqual({ dice: 'default', repeats: false, highFaces: 1, lowFaces: 1 });
  });
});
