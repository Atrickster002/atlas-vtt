import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import { AssetService } from '../../src/app/services/AssetService';
import { mapSightRules } from '../../src/app/services/mapSightRules';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

function rulesFor(settings: CollectionSettings | null, mapPath: string | null = 'atlas-vtt/collections/dungeon/scenes/a.atlasmap'): ReturnType<typeof mapSightRules> {
  const assets = {
    getCollectionForMap: () => (settings ? 'dungeon' : null),
    getCollectionSettings: () => settings ?? { conditions: [] },
  } as unknown as AssetService;
  const spy = vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
  try {
    return mapSightRules({} as App, mapPath);
  } finally {
    spy.mockRestore();
  }
}

describe('mapSightRules', () => {
  it('are the generic senses and no conditions for a map without a collection', () => {
    expect(rulesFor(null)).toBe(GENERIC_SIGHT_RULES);
    expect(rulesFor({ conditions: [] }, null)).toBe(GENERIC_SIGHT_RULES);
  });

  it('are the senses of the collection\'s game system and the collection\'s conditions', () => {
    const conditions = structuredClone(dnd5e.rules.conditions);
    const rules = rulesFor({ conditions, systemPresetId: dnd5e.id });
    expect(rules.definitions).toBe(dnd5e.rules.senses);
    expect(rules.conditions).toBe(conditions);
  });

  it('are the collection\'s own senses once it has any, and the generic ones without a system', () => {
    const own = [GENERIC_SENSES[0]!];
    expect(rulesFor({ conditions: [], senses: own, systemPresetId: dnd5e.id }).definitions).toBe(own);
    expect(rulesFor({ conditions: [] }).definitions).toBe(GENERIC_SENSES);
  });
});
