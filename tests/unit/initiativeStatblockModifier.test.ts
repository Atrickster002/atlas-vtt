import { describe, expect, it, vi } from 'vitest';
import {
  abilityScoreModifier, combatantModifier, ownModifier, parseInitiativeModifier, statblockInitiativeModifier,
} from '../../src/app/initiative/initiativeModifier';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { collectionInitiativeRules } from '../../src/app/gameSystems/initiativeRules';
import { readStatblockModifiers } from '../../src/app/initiative/statblockModifiers';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

describe('an initiative modifier written in a statblock', () => {
  it('reads signed and unsigned whole numbers', () => {
    expect(parseInitiativeModifier('+2')).toBe(2);
    expect(parseInitiativeModifier('-1')).toBe(-1);
    expect(parseInitiativeModifier('−3')).toBe(-3);
    expect(parseInitiativeModifier('2')).toBe(2);
    expect(parseInitiativeModifier(' +4 ')).toBe(4);
    expect(parseInitiativeModifier(5)).toBe(5);
    expect(parseInitiativeModifier(-2)).toBe(-2);
    expect(parseInitiativeModifier(0)).toBe(0);
  });

  it('counts anything else as no value', () => {
    for (const value of ['1d4', '2.5', 2.5, '+', '', 'fast', '+2 (12)', NaN, Infinity, null, undefined, true, [2], { value: 2 }, '99999999999999999999']) {
      expect(parseInitiativeModifier(value), String(value)).toBeNull();
    }
  });

  it('reads the chosen field by its dotted path', () => {
    expect(statblockInitiativeModifier({ fields: { combat: { init: '+3' } } }, { modifier: { field: 'combat.init' } })).toBe(3);
    expect(statblockInitiativeModifier({ fields: { stats: [1, '-2'] } }, { modifier: { field: 'stats.1' } })).toBe(-2);
    expect(statblockInitiativeModifier({ fields: { 'Init Bonus': 1 } }, { modifier: { field: 'init_bonus' } })).toBe(1);
    expect(statblockInitiativeModifier({ fields: { dex: 16 } }, { modifier: { field: 'initiative' } })).toBeNull();
  });

  it('reads an ability score as the d20 rule\'s modifier', () => {
    expect([1, 8, 9, 10, 11, 12, 16, 20, 30].map(abilityScoreModifier)).toEqual([-5, -1, -1, 0, 0, 1, 3, 5, 10]);
    expect(statblockInitiativeModifier({ fields: { dex: '16' } }, { modifier: { field: 'dex', abilityScore: true } })).toBe(3);
    expect(statblockInitiativeModifier({ fields: { dex: '+3' } }, { modifier: { field: 'dex', abilityScore: true } })).toBe(-4);
  });

  it('reads the field the statblock\'s template means as initiative where none is chosen or the chosen one is missing', () => {
    expect(statblockInitiativeModifier({ fields: { init: 4 }, meanings: { initiative: 'init' } }, {})).toBe(4);
    expect(statblockInitiativeModifier({ fields: { init: 4 }, meanings: { initiative: 'init' } }, { modifier: { field: 'bonus' } })).toBe(4);
    expect(statblockInitiativeModifier({ fields: { initiative: 4 } }, {})).toBeNull();
    expect(statblockInitiativeModifier({ fields: { init: 4, other: 1 }, meanings: { initiative: 'init' } }, { modifier: { field: 'other' } })).toBe(1);
  });

  it('falls back to the rules\' second source last', () => {
    const sources = { modifier: { field: 'initiative' }, modifierFallback: { field: 'stats.1', abilityScore: true as const } };
    expect(statblockInitiativeModifier({ fields: { initiative: '+7', stats: [10, 16] } }, sources)).toBe(7);
    expect(statblockInitiativeModifier({ fields: { init: 1, stats: [10, 16] }, meanings: { initiative: 'init' } }, sources)).toBe(1);
    expect(statblockInitiativeModifier({ fields: { stats: [10, 16] } }, sources)).toBe(3);
    expect(statblockInitiativeModifier({ fields: { stats: [10] } }, sources)).toBeNull();
  });

  it('gives a 5e Bandit Captain of Fantasy Statblocks\' SRD (DEX 16) +3 by the D&D 5e rules', () => {
    // As Fantasy Statblocks' bundled SRD holds it: no initiative, the six scores as `stats`
    const banditCaptain = {
      name: 'Bandit Captain', source: '5e SRD', size: 'Medium', type: 'humanoid', ac: 15, hp: 65, hit_dice: '10d8 + 20',
      speed: '30 ft.', stats: [15, 16, 14, 14, 11, 14], saves: [{ strength: 4 }, { dexterity: 5 }, { wisdom: 2 }], cr: '2',
    };
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === 'D&D 5e')!;
    const rules = collectionInitiativeRules({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS);
    expect(statblockInitiativeModifier({ fields: banditCaptain }, rules)).toBe(3);
  });
});

describe('the modifier a combatant rolls with', () => {
  it('is the GM\'s own modifier on the entry, before the statblock\'s, an explicit 0 too', () => {
    expect(combatantModifier(2, 5)).toBe(2);
    expect(combatantModifier(-1, 5)).toBe(-1);
    expect(combatantModifier(0, 5)).toBe(0);
  });

  it('is the statblock\'s where the entry holds none of its own', () => {
    expect(combatantModifier(undefined, 5)).toBe(5);
    expect(combatantModifier(undefined, -2)).toBe(-2);
  });

  it('is 0 where neither gives one', () => {
    expect(combatantModifier(undefined, null)).toBe(0);
  });
});

describe('the GM\'s own modifier on an entry', () => {
  const base = { initiativeModifier: 0 };
  it('is the one set in the edit popup, 0 included', () => {
    expect(ownModifier({ initiativeModifier: 0, modifierByHand: true })).toBe(0);
    expect(ownModifier({ initiativeModifier: 4, modifierByHand: true })).toBe(4);
  });

  it('is none for the 0 every entry was written with before, and a value an older file holds stays its own', () => {
    expect(ownModifier(base)).toBeUndefined();
    expect(ownModifier({ initiativeModifier: 2 })).toBe(2);
  });
});

function entry(id: string, tokenId = id): InitiativeEntry {
  return { id, tokenId, name: id, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true, order: 0, isActive: false };
}

function token(id: string, statblockPath?: string): TokenEntity {
  return { id, kind: 'character', name: id, x: 0, y: 0, imagePath: '', ...(statblockPath && { statblockPath }) } as TokenEntity;
}

describe('reading the statblock modifiers of the combatants', () => {
  it('reads each linked note once and gives a modifier only where the statblock has one', async () => {
    const read = vi.fn(async (path: string) => (path === 'captain.md' ? { fields: { initiative: '+5' } } : { fields: { hp: 3 } }));
    const tokens = { a: token('a', 'captain.md'), b: token('b', 'captain.md'), c: token('c', 'goblin.md'), d: token('d') };
    const result = await readStatblockModifiers([entry('a'), entry('b'), entry('c'), entry('d')], tokens, { modifier: { field: 'initiative' } }, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect([...result.modifiers]).toEqual([['a', 5], ['b', 5]]);
    expect(result.unread).toEqual(['c']);
  });

  it('counts a note that cannot be read as giving no modifier', async () => {
    const read = vi.fn(async () => null);
    const result = await readStatblockModifiers([entry('a')], { a: token('a', 'x.md') }, {}, read);
    expect(result.modifiers.size).toBe(0);
    expect(result.unread).toEqual(['a']);
  });

  it('reads nothing for entries without a linked statblock', async () => {
    const read = vi.fn(async () => null);
    const result = await readStatblockModifiers([entry('a'), entry('gone', 'missing')], { a: token('a') }, {}, read);
    expect(read).not.toHaveBeenCalled();
    expect(result.modifiers.size).toBe(0);
    expect(result.unread).toEqual([]);
  });
});

describe('the fields offered for the initiative modifier', () => {
  it('offers the templates\' initiative first, then their numbers, then the statblocks\' modifiers', async () => {
    const { initiativeFieldSuggestions } = await import('../../src/app/initiative/initiativeFieldSuggestions');
    const { BUILT_IN_TEMPLATES } = await import('../../src/app/statblocks/presets');
    const monster = BUILT_IN_TEMPLATES.find((t) => t.id === 'builtin:5e-2024-monster')!.template;
    const offered = initiativeFieldSuggestions([monster], [{ init_bonus: '+2', name: 'Bandit', stats: [15, 16] }]);
    expect(offered[0]).toEqual({ path: 'initiative', label: 'Initiative' });
    expect(offered.map((s) => s.path)).toContain('init_bonus');
    expect(offered).toContainEqual({ path: 'stats.1', label: 'Dex' });
    expect(offered.map((s) => s.path)).not.toContain('name');
    expect(new Set(offered.map((s) => s.path)).size).toBe(offered.length);
  });
});
