import { describe, expect, it, vi } from 'vitest';
import {
  combatantModifier, parseInitiativeModifier, statblockInitiativeModifier,
} from '../../src/app/initiative/initiativeModifier';
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
    expect(statblockInitiativeModifier({ fields: { combat: { init: '+3' } } }, 'combat.init')).toBe(3);
    expect(statblockInitiativeModifier({ fields: { stats: [1, '-2'] } }, 'stats.1')).toBe(-2);
    expect(statblockInitiativeModifier({ fields: { 'Init Bonus': 1 } }, 'init_bonus')).toBe(1);
    expect(statblockInitiativeModifier({ fields: { dex: 16 } }, 'initiative')).toBeNull();
  });

  it('reads the field the statblock\'s template means as initiative where none is chosen', () => {
    expect(statblockInitiativeModifier({ fields: { init: 4 }, meanings: { initiative: 'init' } }, undefined)).toBe(4);
    expect(statblockInitiativeModifier({ fields: { initiative: 4 } }, undefined)).toBeNull();
    expect(statblockInitiativeModifier({ fields: { init: 4, other: 1 }, meanings: { initiative: 'init' } }, 'other')).toBe(1);
  });
});

describe('the modifier a combatant rolls with', () => {
  it('is the GM\'s own modifier on the entry, before the statblock\'s', () => {
    expect(combatantModifier(2, 5)).toBe(2);
    expect(combatantModifier(-1, 5)).toBe(-1);
  });

  it('is the statblock\'s where the entry holds none of its own', () => {
    expect(combatantModifier(0, 5)).toBe(5);
    expect(combatantModifier(0, -2)).toBe(-2);
  });

  it('keeps the entry\'s own where the statblock gives none, never replacing it with 0', () => {
    expect(combatantModifier(3, null)).toBe(3);
    expect(combatantModifier(0, null)).toBe(0);
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
    const result = await readStatblockModifiers([entry('a'), entry('b'), entry('c'), entry('d')], tokens, 'initiative', read);
    expect(read).toHaveBeenCalledTimes(2);
    expect([...result.modifiers]).toEqual([['a', 5], ['b', 5]]);
    expect(result.unread).toEqual(['c']);
  });

  it('counts a note that cannot be read as giving no modifier', async () => {
    const read = vi.fn(async () => null);
    const result = await readStatblockModifiers([entry('a')], { a: token('a', 'x.md') }, 'initiative', read);
    expect(result.modifiers.size).toBe(0);
    expect(result.unread).toEqual(['a']);
  });

  it('reads nothing for entries without a linked statblock', async () => {
    const read = vi.fn(async () => null);
    const result = await readStatblockModifiers([entry('a'), entry('gone', 'missing')], { a: token('a') }, 'initiative', read);
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
    expect(offered.map((s) => s.path)).toContain('stats.1');
    expect(offered.map((s) => s.path)).not.toContain('name');
    expect(new Set(offered.map((s) => s.path)).size).toBe(offered.length);
  });
});
