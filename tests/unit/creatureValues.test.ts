import { describe, expect, it } from 'vitest';
import { formatRating, optionKey, parseOptions, parseRating } from '../../src/app/creatures/creatureValues';

describe('parseRating', () => {
  it.each([
    [5, 5],
    [0.25, 0.25],
    ['5', 5],
    ['1/4', 0.25],
    ['1 / 8', 0.125],
    ['½', 0.5],
    ['¼', 0.25],
    ['⅛', 0.125],
    ['Creature 3', 3],
    ['Level 12', 12],
    ['CR 1/2 (100 XP)', 0.5],
    ['3+1*', 3],
    ['2*', 2],
    ['-1', -1],
    ['−1', -1],
    ['Creature −1', -1],
    ['1-1', 1],
    ['+2', 2],
    [' 7 ', 7],
    [[3], 3],
    [['Level 4'], 4],
  ])('reads %j as %d', (raw, expected) => {
    expect(parseRating(raw)).toBeCloseTo(expected);
  });

  it.each([
    [''], ['—'], ['none'], [null], [undefined], [true], [{ value: 3 }], [Number.NaN], [Number.POSITIVE_INFINITY], ['1/0'], [[]],
  ])('has no rating for %j', (raw) => {
    expect(parseRating(raw)).toBeNull();
  });
});

describe('formatRating', () => {
  it.each([
    [0, '0'], [0.125, '1/8'], [0.25, '1/4'], [0.5, '1/2'], [1 / 3, '1/3'], [2, '2'], [-1, '-1'], [1.5, '1 1/2'], [2.7, '2.7'],
  ])('shows %d as %s', (value, label) => {
    expect(formatRating(value)).toBe(label);
  });
});

describe('parseOptions', () => {
  it('keeps plain strings and numbers', () => {
    expect(parseOptions('beast')).toEqual(['beast']);
    expect(parseOptions(3)).toEqual(['3']);
  });

  it('reads booleans as yes and no', () => {
    expect(parseOptions(true)).toEqual(['Yes']);
    expect(parseOptions(false)).toEqual(['No']);
  });

  it('flattens arrays, including the nested arrays YAML makes of unquoted wiki links', () => {
    expect(parseOptions(['Fire', ['Undead', ['Evil']]])).toEqual(['Fire', 'Undead', 'Evil']);
    expect(parseOptions([['Monster Manual']])).toEqual(['Monster Manual']);
  });

  it('shows links by their alias or note name', () => {
    expect(parseOptions('[[Books/Monster Manual.md|MM]]')).toEqual(['MM']);
    expect(parseOptions('[[Books/Monster Manual]]')).toEqual(['Monster Manual']);
    expect(parseOptions('[[Monster Manual#Goblins]]')).toEqual(['Monster Manual']);
    expect(parseOptions('[Monster Manual](Books/Monster%20Manual.md)')).toEqual(['Monster Manual']);
  });

  it('decodes the link encoding Fantasy Statblocks gives bestiary values', () => {
    expect(parseOptions('<STATBLOCK-WIKI-LINK>Monster Manual<STATBLOCK-WIKI-LINK> p.114')).toEqual(['Monster Manual']);
    expect(parseOptions('<STATBLOCK-WIKI-LINK>Books/Tome|Tome of Beasts<STATBLOCK-WIKI-LINK>')).toEqual(['Tome of Beasts']);
    expect(parseOptions('<STATBLOCK-MARKDOWN-LINK>Books/Big%20Book.md<STATBLOCK-MARKDOWN-LINK>')).toEqual(['Big Book']);
  });

  it('drops page references so one book is one option', () => {
    expect(parseOptions('[[Monster Manual]] p.114')).toEqual(['Monster Manual']);
    expect(parseOptions('Dolmenwood Campaign Book, pg. 12')).toEqual(['Dolmenwood Campaign Book']);
    expect(parseOptions('Bestiary page 3-4')).toEqual(['Bestiary']);
    expect(parseOptions('Bestiary pp 30–31')).toEqual(['Bestiary']);
  });

  it('collapses whitespace', () => {
    expect(parseOptions('  Small   Animal ')).toEqual(['Small Animal']);
  });

  it('leaves out empty values, objects and descriptions', () => {
    expect(parseOptions('')).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions({ name: 'Bite' })).toEqual([]);
    expect(parseOptions([{ name: 'Bite' }, 'Fire'])).toEqual(['Fire']);
    expect(parseOptions('x'.repeat(81))).toEqual([]);
  });
});

describe('optionKey', () => {
  it('compares options regardless of case', () => {
    expect(optionKey('Beast')).toBe(optionKey('beast'));
  });
});
