import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../gameSystems/senses';
import { resolveSenses, tokenSenses, withSenses } from '../tokenSenses';
import type { TokenVision } from '../../types/lightingTypes';

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const PATHFINDER = BUILT_IN_SENSES['builtin:pathfinder2e']!;
const SHADOWDARK = BUILT_IN_SENSES['builtin:shadowdark']!;

describe('tokenSenses', () => {
  it('are the token\'s senses once it has any, whatever its old fields say', () => {
    const senses = [{ id: 'dnd5e:truesight', range: 120 }];
    expect(tokenSenses({ enabled: true, darkvision: 60, tremorsense: 30, senses }, DND)).toBe(senses);
    expect(tokenSenses({ enabled: true, darkvision: 60, senses: [] }, DND)).toEqual([]);
  });

  it('reads an old darkvision or tremorsense number as the collection\'s sense of that kind, with that distance', () => {
    expect(tokenSenses({ enabled: true, darkvision: 60, tremorsense: 30 }, DND))
      .toEqual([{ id: 'dnd5e:darkvision', range: 60 }, { id: 'dnd5e:tremorsense', range: 30 }]);
    expect(tokenSenses({ enabled: true, darkvision: 60 }, PATHFINDER)).toEqual([{ id: 'pathfinder2e:darkvision', range: 60 }]);
    expect(tokenSenses({ enabled: false, tremorsense: 15 }, GENERIC_SENSES)).toEqual([{ id: 'tremorsense', range: 15 }]);
  });

  it('reads them as the generic senses where the collection has no such sense', () => {
    expect(tokenSenses({ enabled: true, darkvision: 60, tremorsense: 30 }, SHADOWDARK))
      .toEqual([{ id: 'darkvision', range: 60 }, { id: 'tremorsense', range: 30 }]);
    expect(tokenSenses({ enabled: true, darkvision: 60 }, [])).toEqual([{ id: 'darkvision', range: 60 }]);
  });

  it('has none without vision settings, without the old fields, or with numbers that are no distance', () => {
    expect(tokenSenses(undefined, DND)).toEqual([]);
    expect(tokenSenses({ enabled: true, range: 60, angle: 90 }, DND)).toEqual([]);
    expect(tokenSenses({ enabled: true, darkvision: 0, tremorsense: -5 }, DND)).toEqual([]);
    expect(tokenSenses({ enabled: true, darkvision: Number.NaN }, DND)).toEqual([]);
  });
});

describe('withSenses', () => {
  it('writes the senses and drops the old fields, keeping the rest', () => {
    const vision: TokenVision = { enabled: true, range: 120, angle: 90, darkvision: 60, tremorsense: 30 };
    const senses = [{ id: 'dnd5e:darkvision', range: 60 }];
    expect(withSenses(vision, senses)).toEqual({ enabled: true, range: 120, angle: 90, senses });
    expect(vision).toHaveProperty('darkvision', 60);
  });

  it('keeps an empty list, so the old fields never come back', () => {
    const written = withSenses({ enabled: true, darkvision: 60 }, []);
    expect(written).toEqual({ enabled: true, senses: [] });
    expect(tokenSenses(written, DND)).toEqual([]);
  });

  it('round-trips a token read from its old fields', () => {
    const old: TokenVision = { enabled: true, darkvision: 60, tremorsense: 30 };
    const written = withSenses(old, tokenSenses(old, DND));
    expect(written).toEqual({ enabled: true, senses: [{ id: 'dnd5e:darkvision', range: 60 }, { id: 'dnd5e:tremorsense', range: 30 }] });
    expect(tokenSenses(written, DND)).toEqual(tokenSenses(old, DND));
  });
});

describe('resolveSenses', () => {
  const ids = (resolved: ReturnType<typeof resolveSenses>): [string, number | undefined][] => resolved.map(({ definition, range }) => [definition.id, range]);

  it('pairs each sense with its definition and its distance', () => {
    expect(ids(resolveSenses([{ id: 'dnd5e:darkvision', range: 90 }, { id: 'blindsight', range: 10 }], DND)))
      .toEqual([['dnd5e:darkvision', 90], ['blindsight', 10]]);
  });

  it('gives a sense that needs a distance its default one, and leaves it out when there is none', () => {
    expect(ids(resolveSenses([{ id: 'dnd5e:darkvision' }, { id: 'dnd5e:devils-sight' }], DND))).toEqual([['dnd5e:darkvision', 60], ['dnd5e:devils-sight', 120]]);
    expect(resolveSenses([{ id: 'darkvision' }, { id: 'pathfinder2e:hearing' }], PATHFINDER)).toEqual([]);
  });

  it('lets a sense without a distance reach without limit', () => {
    expect(ids(resolveSenses([{ id: 'pathfinder2e:darkvision' }, { id: 'pathfinder2e:low-light-vision' }], PATHFINDER)))
      .toEqual([['pathfinder2e:darkvision', undefined], ['pathfinder2e:low-light-vision', undefined]]);
  });

  it('still limits such a sense by a distance that is stored, so an old darkvision number reaches as far as before', () => {
    const old = tokenSenses({ enabled: true, darkvision: 60 }, PATHFINDER);
    expect(ids(resolveSenses(old, PATHFINDER))).toEqual([['pathfinder2e:darkvision', 60]]);
  });

  it('leaves out senses the collection does not know', () => {
    expect(ids(resolveSenses([{ id: 'pathfinder2e:scent', range: 30 }, { id: 'made-up', range: 5 }, { id: 'dnd5e:truesight' }], DND)))
      .toEqual([['dnd5e:truesight', 120]]);
  });
});
