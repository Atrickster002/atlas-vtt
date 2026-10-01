import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../gameSystems/lightPresets/generic';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { LightKind } from '../../types/lightingTypes';
import { asCustomLight, chosenLightPreset, defaultLightPreset, emissionOf, lightPresetChips, lightPresetOf } from '../lightPresetChoice';
import { LIGHT_PRESETS, lightKindOf } from '../lightPresets';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
const named = (table: readonly LightPresetDefinition[], name: string): LightPresetDefinition => table.find((light) => light.name === name)!;
const names = (table: readonly LightPresetDefinition[]): string[] => table.map((light) => light.name);

describe('emissionOf', () => {
  it('is the preset\'s light with its kind and the preset it came from', () => {
    const lamp = named(dnd5e, 'Lamp');
    expect(emissionOf(lamp)).toEqual({ bright: 15, dim: 45, color: lamp.color, intensity: 1, animation: lamp.animation, sourceRadius: lamp.sourceRadius, kind: 'lantern', preset: lamp.id });
  });

  it('gives a generic preset the light it always had', () => {
    for (const preset of GENERIC_LIGHT_PRESETS) {
      const id = preset.id as keyof typeof LIGHT_PRESETS;
      expect(emissionOf(preset)).toEqual({ ...LIGHT_PRESETS[id].emission, kind: id, preset: id });
    }
  });
});

describe('lightPresetOf', () => {
  const lamp = named(dnd5e, 'Lamp');
  const hooded = named(dnd5e, 'Hooded lantern');

  it('is the preset the light records, also once its values were edited', () => {
    expect(lightPresetOf(emissionOf(lamp), dnd5e)).toBe(lamp);
    expect(lightPresetOf({ ...emissionOf(lamp), bright: 25, color: '#ffffff' }, dnd5e)).toBe(lamp);
  });

  it('is the preset a light without a record equals, of its kind where it has one', () => {
    const { preset: _preset, kind: _kind, ...bare } = emissionOf(hooded);
    expect(lightPresetOf(bare, dnd5e)).toBe(hooded);
    expect(lightPresetOf({ ...bare, kind: 'lantern' }, dnd5e)).toBe(hooded);
  });

  it('reads a light from another game system, or from before presets, by its kind', () => {
    const old = { ...LIGHT_PRESETS.lantern.emission, bright: 12, kind: 'lantern' as const };
    expect(lightPresetOf(old, dnd5e)).toBe(hooded);
    expect(lightPresetOf({ ...emissionOf(lamp), bright: 25 }, GENERIC_LIGHT_PRESETS)).toBe(named(GENERIC_LIGHT_PRESETS, 'Lantern'));
    expect(lightPresetOf({ ...old, kind: 'candle' }, cairn)).toBeNull();
  });

  it('is none for a custom light, whatever it equals, and for a light that matches nothing', () => {
    expect(lightPresetOf(asCustomLight(emissionOf(lamp)), dnd5e)).toBeNull();
    expect(lightPresetOf({ ...LIGHT_PRESETS.torch.emission, bright: 3 }, dnd5e)).toBeNull();
    expect(lightPresetOf({ ...LIGHT_PRESETS.torch.emission, bright: 3, kind: 'brazier' as LightKind }, dnd5e)).toBeNull();
  });
});

describe('asCustomLight', () => {
  it('keeps the light as it is, with the plain marker and no preset', () => {
    const custom = asCustomLight(emissionOf(named(dnd5e, 'Torch')));
    expect(custom).toMatchObject({ bright: 20, dim: 40, kind: 'custom' });
    expect(custom).not.toHaveProperty('preset');
    expect(lightKindOf(custom)).toBe('custom');
  });
});

describe('the preset a tool places', () => {
  it('is the chosen one while the collection has it, else its torch, else its first light', () => {
    expect(chosenLightPreset(dnd5e, named(dnd5e, 'Daylight').id).name).toBe('Daylight');
    expect(chosenLightPreset(dnd5e, 'cairn-torch').name).toBe('Torch');
    expect(chosenLightPreset(dnd5e, null).name).toBe('Torch');
    expect(defaultLightPreset([named(dnd5e, 'Candle'), named(dnd5e, 'Lamp')]).name).toBe('Candle');
  });
});

describe('lightPresetChips', () => {
  it('shows every preset as a chip while four or fewer', () => {
    expect(lightPresetChips(GENERIC_LIGHT_PRESETS)).toEqual({ chips: GENERIC_LIGHT_PRESETS, more: [] });
    expect(lightPresetChips(cairn)).toEqual({ chips: cairn, more: [] });
  });

  it('shows the first preset of each kind as a chip, so no two chips share a glyph, and the others under More', () => {
    const { chips, more } = lightPresetChips(dnd5e);
    expect(names(chips)).toEqual(['Candle', 'Torch', 'Hooded lantern', 'Light']);
    expect(names(more)).toEqual(['Lamp', 'Continual Flame', 'Daylight']);
  });

  it('fills up to four chips when the presets have fewer kinds, and keeps the chips in list order', () => {
    const torches = ['a', 'b', 'c', 'd', 'e', 'f'].map((id): LightPresetDefinition => ({ ...named(dnd5e, 'Torch'), id, name: id }));
    const { chips, more } = lightPresetChips([...torches.slice(0, 5), { ...torches[5]!, kind: 'candle' }]);
    expect(names(chips)).toEqual(['a', 'b', 'c', 'f']);
    expect(names(more)).toEqual(['d', 'e']);
  });
});
