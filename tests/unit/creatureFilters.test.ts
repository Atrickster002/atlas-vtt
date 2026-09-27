import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { newCreatureFilterId, parseCreatureFilters, sameCreatureFilters } from '../../src/app/gameSystems/creatureFilters';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import { collectionCreatureFilters, rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../src/app/gameSystems/systemRules';
import type { CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';

const preset = (key: string) => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.id === `builtin:${key}`)!;

describe('built-in creature filters', () => {
  it('rate creatures on each system’s own scale', () => {
    const scaleOf = (key: string) => preset(key).rules.creatureFilters?.find((filter) => filter.kind === 'range');
    expect(scaleOf('dnd5e')).toEqual({ id: 'dnd5e-cr', label: 'CR', kind: 'range', field: 'cr' });
    expect(scaleOf('daggerheart')).toEqual({ id: 'daggerheart-tier', label: 'Tier', kind: 'range', field: 'tier' });
    expect(scaleOf('pathfinder2e')?.field).toBe('level');
    expect(scaleOf('ose')?.field).toBe('level');
    expect(scaleOf('shadowdark')?.field).toBe('level');
    expect(preset('coc7e').rules.creatureFilters).toBeUndefined();
  });

  it('keep their ids unique within each preset', () => {
    for (const { rules } of BUILT_IN_SYSTEM_PRESETS) {
      const ids = (rules.creatureFilters ?? []).map((filter) => filter.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('read Pathfinder traits from both layouts', () => {
    const traits = preset('pathfinder2e').rules.creatureFilters?.find((filter) => filter.label === 'Traits');
    expect(traits).toMatchObject({ kind: 'options', fields: expect.arrayContaining(['traits', 'trait_01', 'trait_07']) });
  });
});

describe('parseCreatureFilters', () => {
  it('keeps usable filters and leaves out the rest', () => {
    expect(parseCreatureFilters([
      { id: 'cr', label: ' CR ', kind: 'range', field: 'cr' },
      { id: 'type', label: '', kind: 'options', fields: ['type', ' type ', '', 3] },
      { id: 'cr', label: 'Duplicate', kind: 'range', field: 'level' },
      { id: 'future', label: 'Future', kind: 'formula', expression: 'cr * 2' },
      { id: 'nofield', label: 'No field', kind: 'range', field: ' ' },
      { id: 'nofields', label: 'No fields', kind: 'options', fields: [] },
      { label: 'No id', kind: 'range', field: 'cr' },
      'junk',
    ])).toEqual([
      { id: 'cr', label: 'CR', kind: 'range', field: 'cr' },
      { id: 'type', label: 'type', kind: 'options', fields: ['type'] },
    ]);
  });

  it('reads anything but a list as no filters', () => {
    expect(parseCreatureFilters(undefined)).toEqual([]);
    expect(parseCreatureFilters({ cr: true })).toEqual([]);
  });
});

describe('sameCreatureFilters', () => {
  const cr: CreatureFilterDefinition = { id: 'dnd5e-cr', label: 'CR', kind: 'range', field: 'cr' };
  it('ignores ids and missing lists but not labels, fields or order', () => {
    const type: CreatureFilterDefinition = { id: 't', label: 'Type', kind: 'options', fields: ['type'] };
    expect(sameCreatureFilters([cr], [{ ...cr, id: 'cr' }])).toBe(true);
    expect(sameCreatureFilters(undefined, [])).toBe(true);
    expect(sameCreatureFilters([cr], [{ ...cr, label: 'Challenge' }])).toBe(false);
    expect(sameCreatureFilters([cr], [{ ...cr, field: 'level' }])).toBe(false);
    expect(sameCreatureFilters([cr, type], [type, cr])).toBe(false);
    expect(sameCreatureFilters([type], [{ ...type, fields: ['type', 'subtype'] }])).toBe(false);
  });
});

describe('creature filters in the system rules', () => {
  it('come with a preset as a copy', () => {
    const dnd = preset('dnd5e');
    const rules = rulesOfPreset(dnd);
    expect(rules.creatureFilters).toEqual(dnd.rules.creatureFilters);
    rules.creatureFilters[0]!.label = 'Changed';
    expect(dnd.rules.creatureFilters?.[0]?.label).toBe('CR');
  });

  it('make a preset count as edited when they change', () => {
    const dnd = preset('dnd5e');
    const rules = rulesOfPreset(dnd);
    expect(sameSystemRules(dnd.rules, rules)).toBe(true);
    expect(sameSystemRules(dnd.rules, { ...rules, creatureFilters: rules.creatureFilters.slice(1) })).toBe(false);
  });

  it('are none in a collection without a game system', () => {
    expect(vanillaSystemSettings().creatureFilters).toEqual([]);
  });

  it('are stored in user presets and survive reading them back', () => {
    const creatureFilters: CreatureFilterDefinition[] = [{ id: 'level', label: 'Level', kind: 'range', field: 'level' }];
    const stored = { id: 'mine', name: 'Dolmenwood', rules: { ...rulesOfPreset(preset('ose')), creatureFilters } };
    expect(parseUserPreset(JSON.parse(JSON.stringify(stored)))?.rules.creatureFilters).toEqual(creatureFilters);
  });
});

describe('collectionCreatureFilters', () => {
  const dnd = preset('dnd5e');

  it('reads the filters a collection stores', () => {
    const stored: CreatureFilterDefinition[] = [{ id: 'hd', label: 'HD', kind: 'range', field: 'hit_dice' }];
    expect(collectionCreatureFilters({ creatureFilters: stored, systemPresetId: dnd.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual(stored);
    expect(collectionCreatureFilters({ creatureFilters: [], systemPresetId: dnd.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([]);
  });

  it('gives a collection saved before filters existed those of its preset, so it is not edited', () => {
    const { creatureFilters: _none, ...before } = rulesOfPreset(dnd);
    const filters = collectionCreatureFilters({ ...before, systemPresetId: dnd.id }, BUILT_IN_SYSTEM_PRESETS);
    expect(filters).toEqual(dnd.rules.creatureFilters);
    expect(sameSystemRules(dnd.rules, { ...before, creatureFilters: filters })).toBe(true);
  });

  it('finds the preset of such a collection by its rules when it records none', () => {
    const { creatureFilters: _none, ...before } = rulesOfPreset(dnd);
    expect(collectionCreatureFilters(before, BUILT_IN_SYSTEM_PRESETS)).toEqual(dnd.rules.creatureFilters);
    expect(collectionCreatureFilters({}, BUILT_IN_SYSTEM_PRESETS)).toEqual([]);
  });
});

describe('newCreatureFilterId', () => {
  it('derives a free id from the label', () => {
    const existing: CreatureFilterDefinition[] = [{ id: 'hit-dice', label: 'Hit dice', kind: 'range', field: 'hd' }];
    expect(newCreatureFilterId(existing, 'Hit Dice')).toBe('hit-dice-2');
    expect(newCreatureFilterId(existing, 'Role')).toBe('role');
    expect(newCreatureFilterId(existing, '???')).toBe('filter');
  });
});
