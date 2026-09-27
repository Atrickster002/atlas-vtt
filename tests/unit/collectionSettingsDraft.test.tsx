import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { useCollectionSettingsDraft } from '../../src/app/react/components/collection-settings/useCollectionSettingsDraft';
import type { AssetService } from '../../src/app/services/AssetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';

const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

function draftFor(settings: CollectionSettings) {
  const assets = { getCollectionSettings: () => settings } as unknown as AssetService;
  return renderHook(() => useCollectionSettingsDraft(assets, 'dungeon', true, BUILT_IN_SYSTEM_PRESETS));
}

it('switching systems replaces every condition, even one with the same name', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), systemPresetId: shadowdark.id });
  act(() => result.current.applyPreset(dnd5e));

  const settings = result.current.toSettings();
  expect(settings.systemPresetId).toBe(dnd5e.id);
  expect(settings.conditions?.map((c) => c.id)).toEqual(dnd5e.rules.conditions.map((c) => c.id));
  expect(settings.conditions?.some((c) => c.id.startsWith('shadowdark-'))).toBe(false);
});

it('clearing the system leaves the vanilla settings', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), defaultWidgets: { timer: true }, systemPresetId: shadowdark.id });
  act(() => result.current.clearSystem());
  expect(result.current.toSettings()).toMatchObject({ conditions: [], defaultWidgets: {}, systemPresetId: undefined });
});

it('switching systems replaces the creature filters, and clearing the system removes them', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), systemPresetId: shadowdark.id });
  expect(result.current.creatureFilters).toEqual(shadowdark.rules.creatureFilters);
  act(() => result.current.applyPreset(dnd5e));
  expect(result.current.toSettings().creatureFilters).toEqual(dnd5e.rules.creatureFilters);
  act(() => result.current.clearSystem());
  expect(result.current.toSettings().creatureFilters).toEqual([]);
});

it('a collection saved before creature filters existed offers its preset\'s and saves them', () => {
  const { creatureFilters: _none, ...before } = structuredClone(dnd5e.rules);
  const { result } = draftFor({ ...before, systemPresetId: dnd5e.id });
  expect(result.current.toSettings().creatureFilters).toEqual(dnd5e.rules.creatureFilters);
});

it('keeps edited creature filters', () => {
  const { result } = draftFor({ ...structuredClone(dnd5e.rules), systemPresetId: dnd5e.id });
  act(() => result.current.setCreatureFilters([{ id: 'hd', label: 'HD', kind: 'range', field: 'hit_dice' }]));
  expect(result.current.toSettings().creatureFilters).toEqual([{ id: 'hd', label: 'HD', kind: 'range', field: 'hit_dice' }]);
});
