import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { HP_RESOURCE, withLegacyBars } from './resourceDefinitions';
import { MAX_RESOURCES, type ResourceDefinition } from './resourceTypes';

/**
 * The resources of a collection. One saved before resources existed (or
 * imported from such a vault) reads as its preset's, else as the bars its
 * default widgets switched on.
 */
export function collectionResources(
  settings: Pick<CollectionSettings, 'resources' | 'defaultWidgets' | 'systemPresetId'>,
): ResourceDefinition[] {
  // Capped here too: settings can arrive without passing the index's parser (an import in this session)
  return (settings.resources ?? legacyCollectionResources(settings, BUILT_IN_SYSTEM_PRESETS)).slice(0, MAX_RESOURCES);
}

/**
 * Definitions for a collection saved before resources existed: its recorded
 * preset's (HP without one), with the bars the collection's own default
 * widgets switched on or off.
 */
export function legacyCollectionResources(
  settings: Pick<CollectionSettings, 'defaultWidgets' | 'systemPresetId'>,
  presets: readonly SystemPreset[],
): ResourceDefinition[] {
  const preset = presets.find((p) => p.id === settings.systemPresetId);
  const resources = preset?.rules.resources ? structuredClone(preset.rules.resources) : [{ ...HP_RESOURCE }];
  return withLegacyBars(resources, settings.defaultWidgets);
}

/** The part of the asset service that tells a map's collection and its settings. */
export interface CollectionLookup {
  getCollectionForMap(mapPath: string): string | null;
  getCollectionSettings(collectionId: string): CollectionSettings;
}

/** The resources tokens on a map track: its collection's, or HP alone for a map outside every collection. */
export function mapResources(assets: CollectionLookup, mapPath: string | null | undefined): ResourceDefinition[] {
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  return collectionResources(collectionId ? assets.getCollectionSettings(collectionId) : {});
}
