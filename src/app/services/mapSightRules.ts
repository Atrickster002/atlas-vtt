import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { collectionSenses } from '../gameSystems/senseRules';
import { GENERIC_SIGHT_RULES, type SightRules } from '../vision/sightRules';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { SystemPresetService } from './SystemPresetService';

/** The senses and conditions of the collection that holds the map; the generic senses without one. */
export function mapSightRules(app: App, mapPath: string | null | undefined): SightRules {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  if (!collectionId) return GENERIC_SIGHT_RULES;

  const settings = SettingsService.forApp(app);
  const presets = settings ? new SystemPresetService(settings).list() : BUILT_IN_SYSTEM_PRESETS;
  const collection = assets.getCollectionSettings(collectionId);
  return { definitions: collectionSenses(collection, presets), conditions: collection.conditions ?? [] };
}
