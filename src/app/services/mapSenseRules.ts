import type { App } from 'obsidian';
import type { SenseRules } from '../creatures/tokenSensesResolver';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { collectionSenses } from '../gameSystems/senseRules';
import { GENERIC_SENSES } from '../gameSystems/senses';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import type { ViewAtlasState } from '../storeFactory';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import type { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { SystemPresetService } from './SystemPresetService';

/** The presets a collection's senses may come from; the user's are read only when it names one of them. */
function presetsFor(app: App, settings: CollectionSettings): readonly SystemPreset[] {
  if (settings.senses || !settings.systemPresetId) return [];
  if (BUILT_IN_SYSTEM_PRESETS.some((preset) => preset.id === settings.systemPresetId)) return BUILT_IN_SYSTEM_PRESETS;
  const service = SettingsService.forApp(app);
  return service ? new SystemPresetService(service).list() : BUILT_IN_SYSTEM_PRESETS;
}

/**
 * What statblock senses are read with for the map in `state`: the senses of its collection and
 * what it measures in. A map outside a collection has the generic senses and its own grid units.
 */
export function mapSenseRules(
  app: App,
  assetService: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'>,
): SenseRules {
  const collectionId = state.mapPath ? assetService.getCollectionForMap(state.mapPath) : null;
  const settings = collectionId ? assetService.getCollectionSettings(collectionId) : undefined;
  return {
    definitions: settings ? collectionSenses(settings, presetsFor(app, settings)) : GENERIC_SENSES,
    unit: resolveMeasurementSettings(settings?.gridDefaults, state.grid),
  };
}
