import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { legacyCollectionResources } from './collectionResources';

interface Collections {
  getCollections(): Promise<Array<{ id: string; settings?: CollectionSettings }>>;
  updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void>;
}

/**
 * Whether a scene file shows the old secondary bar: its switch is on and a token has a
 * value for it. Any collection could use the bar that way, without its default widget.
 */
export function sceneShowsSecondaryBar(content: string): boolean {
  try {
    const state = (JSON.parse(content) as { state?: { tokenSettings?: { showStressBars?: unknown }; objects?: { tokens?: unknown } } } | null)?.state;
    if (state?.tokenSettings?.showStressBars !== true) return false;
    return Object.values(state.objects?.tokens ?? {}).some((token) => (token as { stress?: unknown } | null)?.stress != null);
  } catch {
    return false;
  }
}

/**
 * Stores the resources of every collection saved before resources existed, so they are
 * decided once, with the scenes as they were, and never derived again. Collections that
 * have their list (an empty one too) are left alone.
 *
 * @param readScenes The content of the collection's scene files.
 */
export async function storeLegacyResources(assets: Collections, readScenes: (collectionId: string) => Promise<string[]>): Promise<void> {
  for (const { id, settings } of await assets.getCollections()) {
    if (settings?.resources) continue;
    try {
      const usedInScenes = (await readScenes(id)).some(sceneShowsSecondaryBar);
      await assets.updateCollectionSettings(id, { resources: legacyCollectionResources(settings ?? {}, BUILT_IN_SYSTEM_PRESETS, usedInScenes) });
    } catch (error) {
      // The collection keeps reading as its preset's until the next start
      console.error(`[Atlas] Could not store the resources of collection ${id}:`, error);
    }
  }
}
