import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { AssetService } from '../../src/app/services/AssetService';
import { mapLightPresets, mapSenses } from '../../src/app/services/mapCollectionRules';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

function appWith(settings: Partial<CollectionSettings>): ReturnType<typeof createInMemoryApp>['app'] {
  vi.spyOn(AssetService.prototype, 'getCollectionForMap').mockImplementation((path) => (path === 'maps/cave.atlasmap' ? 'dungeon' : null));
  vi.spyOn(AssetService.prototype, 'getCollectionSettings').mockReturnValue({ conditions: [], ...settings });
  return createInMemoryApp().app;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the rules of the collection that holds a map', () => {
  it('are its game system\'s senses and light presets', () => {
    const app = appWith({ systemPresetId: dnd5e.id });
    expect(mapSenses(app, 'maps/cave.atlasmap')).toBe(dnd5e.rules.senses);
    expect(mapLightPresets(app, 'maps/cave.atlasmap')).toBe(dnd5e.rules.lightPresets);
  });

  it('are its own once it has any, as far as they can be used', () => {
    const glowMoss = { id: 'home-1', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' } as const;
    const app = appWith({ systemPresetId: dnd5e.id, lightPresets: [glowMoss, { id: 'broken' }] as never });
    expect(mapLightPresets(app, 'maps/cave.atlasmap')).toEqual([glowMoss]);
  });

  it('are the generic ones for a map outside every collection, or without a map', () => {
    const app = appWith({ systemPresetId: dnd5e.id });
    for (const path of ['maps/other.atlasmap', null, undefined]) {
      expect(mapSenses(app, path)).toBe(GENERIC_SENSES);
      expect(mapLightPresets(app, path)).toBe(GENERIC_LIGHT_PRESETS);
    }
  });
});
