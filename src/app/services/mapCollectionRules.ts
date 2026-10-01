import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../gameSystems/lightPresets/generic';
import { readCollectionLightPresets } from '../gameSystems/lightPresetValidation';
import { readCollectionSenses } from '../gameSystems/senseValidation';
import { GENERIC_SENSES } from '../gameSystems/senses/generic';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { LightPresetDefinition } from '../types/lightPresetTypes';
import type { SenseDefinition } from '../types/senseTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { SystemPresetService } from './SystemPresetService';

/** The game system presets of the vault: the built-in ones, and the user's once the settings are loaded. */
export function systemPresetsOf(app: App): readonly SystemPreset[] {
  const settings = SettingsService.forApp(app);
  return settings ? new SystemPresetService(settings).list() : BUILT_IN_SYSTEM_PRESETS;
}

/** The settings of the collection that holds the map; null for a map outside every collection. */
export function mapCollectionSettings(app: App, mapPath: string | null | undefined): CollectionSettings | null {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  return collectionId ? assets.getCollectionSettings(collectionId) : null;
}

/** The senses tokens on the map can have: its collection's, or the generic set without one. */
export function mapSenses(app: App, mapPath: string | null | undefined): readonly SenseDefinition[] {
  const settings = mapCollectionSettings(app, mapPath);
  return settings ? readCollectionSenses(settings, systemPresetsOf(app)) : GENERIC_SENSES;
}

/** The lights offered on the map: its collection's, or the generic ones without one. */
export function mapLightPresets(app: App, mapPath: string | null | undefined): readonly LightPresetDefinition[] {
  const settings = mapCollectionSettings(app, mapPath);
  return settings ? readCollectionLightPresets(settings, systemPresetsOf(app)) : GENERIC_LIGHT_PRESETS;
}
