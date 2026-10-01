import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES } from '../senses';
import { parseSenseDefinitions, parseTokenSenses } from '../senseValidation';
import type { SenseDefinition } from '../../types/senseTypes';

const valid: SenseDefinition = {
  id: 'home-1', name: 'Witch sight', description: 'Sees in the dark within its range.', lineOfSight: true,
  sees: { bright: 'normal', dim: 'as-bright', dark: 'as-dim', magicalDark: 'as-bright' }, look: 'heat', reveals: 'all', precise: true,
  seesInvisible: true, worksWhileBlinded: true, range: 'required', defaultRange: 60, ignores: 'airborne', role: 'darkvision',
};

describe('parseSenseDefinitions', () => {
  it('reads anything that is not a list as no senses of its own', () => {
    for (const raw of [undefined, null, 'darkvision', {}, 5]) expect(parseSenseDefinitions(raw)).toBeUndefined();
    expect(parseSenseDefinitions([])).toEqual([]);
  });

  it('keeps a valid sense as it is, without fields it does not know', () => {
    expect(parseSenseDefinitions([{ ...valid, addedLater: true, sees: { ...valid.sees, twilight: 'normal' } }])).toEqual([valid]);
  });

  it('drops a sense without an id or a name, and one whose id repeats; the others stay', () => {
    const parsed = parseSenseDefinitions([
      { ...valid, id: '' }, { ...valid, id: 7 }, { ...valid, name: '  ' }, 'garbage', null,
      { ...valid, name: '  Witch sight ' }, { ...valid, name: 'Second with the same id' }, { ...valid, id: 'home-2' },
    ]);
    expect(parsed?.map((sense) => [sense.id, sense.name])).toEqual([['home-1', 'Witch sight'], ['home-2', 'Witch sight']]);
  });

  it('replaces each unusable field with the value that shows the players less', () => {
    const [sense] = parseSenseDefinitions([{
      id: 'x', name: 'X', description: 5, lineOfSight: 'no', sees: { bright: 'as-dim', dim: 'monochrome', dark: 'normal' },
      look: 'sepia', reveals: 'everything', precise: 'yes', seesInvisible: 1, worksWhileBlinded: 'true', range: 'far',
      defaultRange: -5, ignores: 'burrowing', role: 'blindsight',
    }])!;
    expect(sense).toEqual({
      id: 'x', name: 'X', description: '', lineOfSight: true, sees: { bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' },
      look: 'colour', reveals: 'creatures', precise: false, seesInvisible: false, worksWhileBlinded: false, range: 'required',
    });
  });

  it('reads a sense with nothing but id and name as one that perceives nothing', () => {
    expect(parseSenseDefinitions([{ id: 'x', name: 'X' }])?.[0]?.sees).toEqual({ bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' });
  });

  it('takes each light level only in a way that level can be seen', () => {
    const sees = (raw: Record<string, string>): SenseDefinition['sees'] => parseSenseDefinitions([{ id: 'x', name: 'X', sees: raw }])![0]!.sees;
    expect(sees({ bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'as-dim' })).toEqual({ bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'as-dim' });
    expect(sees({ bright: 'as-bright', dim: 'as-bright', dark: 'as-bright', magicalDark: 'as-bright' })).toEqual({ bright: 'none', dim: 'as-bright', dark: 'as-bright', magicalDark: 'as-bright' });
    expect(sees({ bright: 'none', dim: 'as-dim', dark: 'normal', magicalDark: 'normal' })).toEqual({ bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' });
  });

  it('keeps a default distance only when it is above 0', () => {
    const defaults = parseSenseDefinitions([0, -1, Number.NaN, Infinity, '60', 45].map((defaultRange, i) => ({ id: `s${i}`, name: 'S', defaultRange })));
    expect(defaults?.map((sense) => sense.defaultRange)).toEqual([undefined, undefined, undefined, undefined, undefined, 45]);
  });
});

describe('parseTokenSenses', () => {
  it('reads anything that is not a list as no senses set', () => {
    for (const raw of [undefined, null, 'darkvision', {}]) expect(parseTokenSenses(raw)).toBeUndefined();
    expect(parseTokenSenses([])).toEqual([]);
  });

  it('keeps ids with distances above 0, drops unusable entries and distances, and keeps the first of a repeated id', () => {
    expect(parseTokenSenses([
      { id: 'darkvision', range: 60 }, { id: 'low-light-vision' }, { id: 'blindsight', range: 0 }, { id: 'tremorsense', range: '30' },
      { id: 'darkvision', range: 120 }, { range: 30 }, { id: '' }, 'truesight', null, { id: 'home', range: 10, other: true },
    ])).toEqual([
      { id: 'darkvision', range: 60 }, { id: 'low-light-vision' }, { id: 'blindsight' }, { id: 'tremorsense' }, { id: 'home', range: 10 },
    ]);
  });

  it('drops senses the collection does not have once its senses are known; the generic ones are always known', () => {
    const raw = [{ id: 'dnd5e:darkvision', range: 60 }, { id: 'pathfinder2e:scent', range: 30 }, { id: 'blindsight', range: 10 }, { id: 'made-up' }];
    expect(parseTokenSenses(raw, BUILT_IN_SENSES['builtin:dnd5e'])).toEqual([{ id: 'dnd5e:darkvision', range: 60 }, { id: 'blindsight', range: 10 }]);
    expect(parseTokenSenses(raw, [])).toEqual([{ id: 'blindsight', range: 10 }]);
    expect(parseTokenSenses(raw)).toHaveLength(4);
  });
});
