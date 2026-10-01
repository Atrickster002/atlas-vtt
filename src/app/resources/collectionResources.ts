import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { HP_RESOURCE, STRESS_RESOURCE } from './resourceDefinitions';
import type { ResourceDefinition } from './resourceTypes';

/**
 * The resources of a collection. One saved before resources existed (or
 * imported from such a vault) reads as its preset's, else as the bars its
 * default widgets switched on.
 */
export function collectionResources(
  settings: Pick<CollectionSettings, 'resources' | 'defaultWidgets' | 'systemPresetId'>,
): ResourceDefinition[] {
  return settings.resources ?? legacyCollectionResources(settings, BUILT_IN_SYSTEM_PRESETS);
}

/**
 * Definitions for a collection saved before resources existed: its recorded
 * preset's, else the bars its default widgets switched on (HP when unset, as
 * the HP bar was on by default).
 */
export function legacyCollectionResources(
  settings: Pick<CollectionSettings, 'defaultWidgets' | 'systemPresetId'>,
  presets: readonly SystemPreset[],
): ResourceDefinition[] {
  const preset = presets.find((p) => p.id === settings.systemPresetId);
  if (preset?.rules.resources) return structuredClone(preset.rules.resources);
  const widgets = settings.defaultWidgets;
  const resources: ResourceDefinition[] = [];
  if (!widgets || widgets.hpBar !== false && (widgets.hpBar === true || !widgets.stressBar)) resources.push({ ...HP_RESOURCE });
  if (widgets?.stressBar) resources.push({ ...STRESS_RESOURCE });
  return resources;
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
