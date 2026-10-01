import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../lightPresets/generic';
import { collectionLightPresets, sameLightPresets } from '../lightPresetRules';
import { parseLightPresets, readCollectionLightPresets } from '../lightPresetValidation';
import { parseUserPreset } from '../presetValidation';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../systemRules';
import { LIGHT_KINDS } from '../../lighting/lightPresets';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { SystemPreset } from '../../types/systemPresetTypes';

const preset = (name: string): SystemPreset => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.name === name)!;
const lights = (name: string): readonly LightPresetDefinition[] => preset(name).rules.lightPresets ?? [];
/** A table as the rules give it: id, name, bright radius, where the dim light ends, the marker's kind. */
const rows = (table: readonly LightPresetDefinition[]): unknown[] => table.map((light) => [light.id, light.name, light.bright, light.dim, light.kind]);

describe('built-in light presets', () => {
  it('keeps the generic four with their ids, and the magical light as the Light cantrip sheds it', () => {
    expect(rows(GENERIC_LIGHT_PRESETS)).toEqual([
      ['candle', 'Candle', 5, 10, 'candle'],
      ['torch', 'Torch', 20, 40, 'torch'],
      ['lantern', 'Lantern', 30, 60, 'lantern'],
      ['magical', 'Magical light', 20, 40, 'magical'],
    ]);
  });

  it('lists D&D 5e\'s light sources (SRD 5.2.1), without the bullseye lantern', () => {
    expect(rows(lights('D&D 5e'))).toEqual([
      ['dnd5e-candle', 'Candle', 5, 10, 'candle'],
      ['dnd5e-torch', 'Torch', 20, 40, 'torch'],
      ['dnd5e-hooded-lantern', 'Hooded lantern', 30, 60, 'lantern'],
      ['dnd5e-light', 'Light', 20, 40, 'magical'],
      ['dnd5e-lamp', 'Lamp', 15, 45, 'lantern'],
      ['dnd5e-continual-flame', 'Continual Flame', 20, 40, 'magical'],
      ['dnd5e-daylight', 'Daylight', 60, 120, 'magical'],
    ]);
  });

  it('lists Pathfinder 2e\'s light sources, a candle shedding dim light only', () => {
    expect(rows(lights('Pathfinder 2e'))).toEqual([
      ['pathfinder2e-candle', 'Candle', 0, 10, 'candle'],
      ['pathfinder2e-torch', 'Torch', 20, 40, 'torch'],
      ['pathfinder2e-hooded-lantern', 'Hooded lantern', 30, 60, 'lantern'],
      ['pathfinder2e-light', 'Light', 20, 40, 'magical'],
      ['pathfinder2e-everlight-crystal', 'Everlight crystal', 20, 40, 'magical'],
      ['pathfinder2e-glow-rod', 'Glow rod', 20, 60, 'magical'],
    ]);
  });

  it('names Shadowdark\'s lights by the band they reach, in the collection\'s feet', () => {
    expect(rows(lights('Shadowdark'))).toEqual([
      ['shadowdark-torch', 'Torch (near)', 30, 30, 'torch'],
      ['shadowdark-lantern', 'Lantern (double near)', 60, 60, 'lantern'],
      ['shadowdark-light', 'Light spell (near)', 30, 30, 'magical'],
    ]);
  });

  it('lists the 30-foot lights of Old-School Essentials and Cairn\'s 40-foot torch', () => {
    expect(rows(lights('Old-School Essentials'))).toEqual([['ose-torch', 'Torch', 30, 30, 'torch'], ['ose-lantern', 'Lantern', 30, 30, 'lantern']]);
    expect(rows(lights('Cairn'))).toEqual([['cairn-torch', 'Torch', 40, 40, 'torch']]);
  });

  it('gives the systems without light rules none, so they use the generic ones', () => {
    for (const name of ['Daggerheart', 'Call of Cthulhu', 'Cyberpunk RED']) {
      expect(preset(name).rules).not.toHaveProperty('lightPresets');
      expect(collectionLightPresets({ systemPresetId: preset(name).id }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
    }
  });

  it('survives its own validation unchanged, with ids that are unique across all systems', () => {
    const tables = [GENERIC_LIGHT_PRESETS, ...BUILT_IN_SYSTEM_PRESETS.flatMap((system) => (system.rules.lightPresets ? [system.rules.lightPresets] : []))];
    for (const table of tables) expect(parseLightPresets(structuredClone(table))).toEqual(table);
    const ids = tables.flat().map((light) => light.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const light of tables.flat()) {
      expect(LIGHT_KINDS).toContain(light.kind);
      expect(light.dim).toBeGreaterThanOrEqual(light.bright);
      expect(light.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('collectionLightPresets', () => {
  const lamp: LightPresetDefinition = { id: 'home-lamp', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' };

  it('is the collection\'s own, else its preset\'s, else the generic ones', () => {
    const dnd5e = preset('D&D 5e');
    expect(collectionLightPresets({ lightPresets: [lamp], systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([lamp]);
    expect(collectionLightPresets({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(dnd5e.rules.lightPresets);
    expect(collectionLightPresets({}, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
    expect(collectionLightPresets({ systemPresetId: 'gone' }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_LIGHT_PRESETS);
  });

  it('never leaves a collection without a light to place: an empty list falls through', () => {
    expect(collectionLightPresets({ lightPresets: [], systemPresetId: preset('Cairn').id }, BUILT_IN_SYSTEM_PRESETS)).toBe(preset('Cairn').rules.lightPresets);
  });

  it('reads stored presets field by field', () => {
    const stored = { systemPresetId: preset('Cairn').id, lightPresets: [{ ...lamp, extra: 1 }, { name: 'No id' }] };
    expect(readCollectionLightPresets(stored, BUILT_IN_SYSTEM_PRESETS)).toEqual([lamp]);
    expect(readCollectionLightPresets({ ...stored, lightPresets: 'torch' }, BUILT_IN_SYSTEM_PRESETS)).toBe(preset('Cairn').rules.lightPresets);
  });
});

describe('parseLightPresets', () => {
  const base = { id: 'a', name: 'Brazier', bright: 10, dim: 20, color: '#FF9A3C', animation: 'torch', kind: 'torch', sourceRadius: 2, intensity: 1.2 };

  it('keeps a complete preset and is undefined for anything but a list', () => {
    expect(parseLightPresets([base])).toEqual([{ ...base, color: '#ff9a3c' }]);
    expect(parseLightPresets(undefined)).toBeUndefined();
    expect(parseLightPresets({})).toBeUndefined();
  });

  it('drops a preset without an id, a name or a reach, and the second of two with one id', () => {
    const list = [{ ...base, id: '' }, { ...base, id: 'b', name: '  ' }, { ...base, id: 'c', bright: 0, dim: 0 }, { ...base, id: 'd', dim: 'far' }, base, { ...base, name: 'Twin' }];
    expect(parseLightPresets(list)?.map((light) => light.name)).toEqual(['Brazier']);
  });

  it('repairs each field it cannot use rather than dropping the light', () => {
    const repaired = parseLightPresets([{ id: 'x', name: ' Glow ', bright: 30, dim: 10, color: 'orange', animation: 'strobe', kind: 'brazier', sourceRadius: 9, intensity: -1 }]);
    expect(repaired).toEqual([{ id: 'x', name: 'Glow', bright: 10, dim: 10, color: '#ffffff', animation: 'none', kind: 'custom', sourceRadius: 5, intensity: 0 }]);
    expect(parseLightPresets([{ ...base, bright: -5, sourceRadius: 0, intensity: 5 }])).toEqual([{ ...base, color: '#ff9a3c', bright: 0, sourceRadius: 0, intensity: 2 }]);
  });
});

describe('light presets in a game system\'s rules', () => {
  const dnd5e = preset('D&D 5e');
  const own: LightPresetDefinition = { id: 'home-1', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' };

  it('are not copied into a collection: it reads its preset\'s until they are edited', () => {
    expect(rulesOfPreset(dnd5e)).not.toHaveProperty('lightPresets');
    expect(vanillaSystemSettings()).toHaveProperty('lightPresets', undefined);
  });

  it('count as the preset\'s while the collection has none of its own, and as edited once they differ', () => {
    const { lightPresets: _lights, ...withoutLights } = dnd5e.rules;
    expect(sameSystemRules(dnd5e.rules, withoutLights)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: structuredClone(dnd5e.rules.lightPresets!) })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: [...dnd5e.rules.lightPresets!, own] })).toBe(false);
    expect(sameSystemRules(dnd5e.rules, { ...dnd5e.rules, lightPresets: dnd5e.rules.lightPresets!.map((light) => ({ ...light, dim: light.dim + 5 })) })).toBe(false);
  });

  it('compare a system without any as the generic ones', () => {
    expect(sameLightPresets(undefined, GENERIC_LIGHT_PRESETS)).toBe(true);
    expect(sameLightPresets(undefined, [own])).toBe(false);
    expect(sameLightPresets([{ ...own, color: '#7EE0A8' }], [own])).toBe(true);
    expect(sameLightPresets([{ ...own, intensity: 1 }], [own])).toBe(true);
  });

  it('are read from a user preset field by field, and left out when it has none', () => {
    const stored = { id: 'user-1', name: 'Homebrew', rules: { gridDefaults: dnd5e.rules.gridDefaults, conditions: [], lightPresets: [own, { id: 'broken' }] } };
    expect(parseUserPreset(stored)?.rules.lightPresets).toEqual([own]);
    const { lightPresets: _lights, ...rules } = stored.rules;
    expect(parseUserPreset({ ...stored, rules })?.rules).not.toHaveProperty('lightPresets');
  });
});
