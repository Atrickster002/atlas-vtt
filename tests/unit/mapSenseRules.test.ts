import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import type { AssetService } from '../../src/app/services/AssetService';
import { mapSenseRules } from '../../src/app/services/mapSenseRules';
import type { GridState } from '../../src/app/services/MapPersistence';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';

const app = {} as App;
const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';

function assets(settings: Partial<CollectionSettings>): Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'> {
  return {
    getCollectionForMap: vi.fn((path: string) => (path === MAP ? 'dungeon' : null)),
    getCollectionSettings: vi.fn(() => ({ conditions: [], ...settings })),
  };
}

describe('mapSenseRules', () => {
  it('gives the collection\'s own senses and its measurement', () => {
    const senses = BUILT_IN_SENSES['builtin:pathfinder2e']!;
    const rules = mapSenseRules(app, assets({
      senses,
      systemPresetId: 'builtin:dnd5e',
      gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' },
    }), { mapPath: MAP, grid: null });
    expect(rules.definitions).toBe(senses);
    expect(rules.unit).toMatchObject({ unitType: 'meters', unitDistance: 1.5 });
  });

  it('takes the senses of the collection\'s built-in preset where it has none of its own', () => {
    expect(mapSenseRules(app, assets({ systemPresetId: 'builtin:dnd5e' }), { mapPath: MAP, grid: null }).definitions).toBe(BUILT_IN_SENSES['builtin:dnd5e']);
    expect(mapSenseRules(app, assets({ systemPresetId: 'builtin:cairn' }), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
    expect(mapSenseRules(app, assets({ systemPresetId: 'a-user-preset' }), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
    expect(mapSenseRules(app, assets({}), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
  });

  it('gives a map outside a collection the generic senses and its own grid units', () => {
    const grid = { unitType: 'yards', unitDistance: 2, measurementType: 'units' } as GridState;
    const rules = mapSenseRules(app, assets({ senses: [] }), { mapPath: 'maps/loose.atlasmap', grid });
    expect(rules.definitions).toBe(GENERIC_SENSES);
    expect(rules.unit).toMatchObject({ unitType: 'yards', unitDistance: 2 });
    expect(mapSenseRules(app, assets({}), { mapPath: null, grid: null }).unit).toMatchObject({ unitType: 'feet', unitDistance: 5 });
  });
});
