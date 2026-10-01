import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import type { AssetService } from '../../src/app/services/AssetService';
import { mapSenseRules } from '../../src/app/services/mapSenseRules';
import { mapPlacementVision } from '../../src/app/services/mapPlacementVision';
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

describe('mapPlacementVision', () => {
  it('reads statblock senses with the collection\'s senses before leaving the default\'s out', () => {
    const scent = BUILT_IN_SENSES['builtin:pathfinder2e']!.find((sense) => sense.name === 'Scent')!;
    const defaultTokenVision = { range: 60, senses: [{ id: scent.id }] };
    const wolf = { senses: 'Perception +7; low-light vision, scent (imprecise) 30 feet' };
    const pathfinder = mapPlacementVision(app, assets({ systemPresetId: 'builtin:pathfinder2e', defaultTokenVision }), { mapPath: MAP, grid: null });
    expect(pathfinder(wolf)).toEqual({ enabled: false, range: 60 });
    expect(pathfinder(null)).toEqual({ enabled: false, ...defaultTokenVision });
    // No sense of a 5e collection is named by the wolf's line, so the default stands.
    const dnd = mapPlacementVision(app, assets({ systemPresetId: 'builtin:dnd5e', defaultTokenVision }), { mapPath: MAP, grid: null });
    expect(dnd(wolf)).toEqual({ enabled: false, ...defaultTokenVision });
  });

  it('stamps nothing where the collection sets no default or the map has no collection', () => {
    expect(mapPlacementVision(app, assets({}), { mapPath: MAP, grid: null })(null)).toBeUndefined();
    expect(mapPlacementVision(app, assets({ defaultTokenVision: { range: 60 } }), { mapPath: 'maps/loose.atlasmap', grid: null })(null)).toBeUndefined();
  });
});
