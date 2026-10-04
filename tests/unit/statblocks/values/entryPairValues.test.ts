import type { EntryShape } from '../../../../src/app/statblocks/model/templateTypes';
import {
  entryExtras, entryItems, entryName, entryNameKey, entryText, entryTextKey,
} from '../../../../src/app/statblocks/values/entryValues';
import { normalisePairs, pairValue, parsePairText } from '../../../../src/app/statblocks/values/pairValues';

const DAGGERHEART: EntryShape = {
  textKey: 'text',
  extras: [
    { key: 'range', label: 'Range', type: 'text' },
    { key: 'cost', label: 'Cost', type: 'number' },
    { key: 'damage', label: 'Damage', type: 'dice' },
  ],
};

describe('entries', () => {
  it('reads name and text with the default keys of Fantasy Statblocks', () => {
    const entry = { name: 'Bramble Lash', desc: '*Melee Attack:* +6 to hit.' };
    expect(entryNameKey()).toBe('name');
    expect(entryTextKey()).toBe('desc');
    expect(entryName(entry)).toBe('Bramble Lash');
    expect(entryText(entry)).toBe('*Melee Attack:* +6 to hit.');
  });

  it('reads the keys a shape names', () => {
    const entry = { name: 'Thorns', text: 'Deal 1d6.', desc: 'not this', range: 'Close', cost: 0, damage: '' };
    expect(entryText(entry, DAGGERHEART)).toBe('Deal 1d6.');
    expect(entryExtras(entry, DAGGERHEART)).toEqual([
      { key: 'range', label: 'Range', type: 'text', value: 'Close' },
      { key: 'cost', label: 'Cost', type: 'number', value: 0 },
    ]);
    expect(entryName({ title: 'Thorns' }, { nameKey: 'title' })).toBe('Thorns');
    expect(entryNameKey({ nameKey: '' })).toBe('name');
  });

  it('reads an entry written as text as text without a name', () => {
    expect(entryName('Pack Tactics. Advantage.')).toBeUndefined();
    expect(entryText('Pack Tactics. Advantage.')).toBe('Pack Tactics. Advantage.');
    expect(entryExtras('Pack Tactics.', DAGGERHEART)).toEqual([]);
  });

  it('has no name or text where they are blank or missing', () => {
    expect(entryName({ name: '  ', desc: 'x' })).toBeUndefined();
    expect(entryText({ name: 'x' })).toBeUndefined();
    expect(entryText(undefined)).toBeUndefined();
    expect(entryName(['a'])).toBeUndefined();
  });

  it('lists the entries of a value', () => {
    expect(entryItems([{ name: 'A' }, null, { name: '', desc: '' }, 'B'])).toEqual([{ name: 'A' }, 'B']);
    expect(entryItems({ name: 'Lone' })).toEqual([{ name: 'Lone' }]);
    expect(entryItems(undefined)).toEqual([]);
    expect(entryItems('')).toEqual([]);
  });
});

describe('pairs', () => {
  it('normalises records, lists of records and text items', () => {
    expect(normalisePairs({ dex: 5, con: 3 })).toEqual([{ key: 'dex', value: 5 }, { key: 'con', value: 3 }]);
    expect(normalisePairs([{ intelligence: 5 }, { wisdom: 2, charisma: 1 }])).toEqual([
      { key: 'intelligence', value: 5 }, { key: 'wisdom', value: 2 }, { key: 'charisma', value: 1 },
    ]);
    expect(normalisePairs(['Stealth +5', 'Perception: 4', 'Darkvision', ' '])).toEqual([
      { key: 'Stealth', value: 5 }, { key: 'Perception', value: 4 }, { key: 'Darkvision', value: null },
    ]);
    expect(normalisePairs('Str −1')).toEqual([{ key: 'Str', value: -1 }]);
    expect(normalisePairs([5, null, [{ a: 1 }]])).toEqual([]);
    expect(normalisePairs(undefined)).toEqual([]);
  });

  it('reads a name and a number written as text', () => {
    expect(parsePairText('Dex +5')).toEqual({ key: 'Dex', value: 5 });
    expect(parsePairText('Sleight of Hand 7')).toEqual({ key: 'Sleight of Hand', value: 7 });
    expect(parsePairText('+5')).toBeNull();
    expect(parsePairText('Str 18 (+4)')).toBeNull();
  });

  it('finds a slot by key, then by label, in any case', () => {
    expect(pairValue({ dex: 5 }, 'dex')).toBe(5);
    expect(pairValue([{ dexterity: 6 }], 'Dexterity', 'Dex')).toBe(6);
    expect(pairValue([{ DEX: 7 }], 'dexterity', 'Dex')).toBe(7);
    expect(pairValue({ dexterity: 6, Dex: 7 }, 'dexterity', 'Dex')).toBe(6);
    expect(pairValue({ dex: null }, 'dex')).toBeNull();
    expect(pairValue({ con: 2 }, 'dexterity', 'Dex')).toBeUndefined();
    expect(pairValue({ con: 2 }, undefined, '')).toBeUndefined();
  });
});
