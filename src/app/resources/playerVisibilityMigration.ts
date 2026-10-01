import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { collectionResources } from './collectionResources';
import type { ResourceDefinition } from './resourceTypes';

/** The player-window switches that showed HP and the secondary bar before resources decided it themselves. */
export interface LegacyPlayerBars {
  hp: boolean;
  stress: boolean;
}

/** `definitions` with HP and Stress shown to players where the old switches showed them. */
export function withPlayerVisibility(definitions: readonly ResourceDefinition[], legacy: LegacyPlayerBars): ResourceDefinition[] {
  return definitions.map((definition) => ((definition.key === 'hp' && legacy.hp) || (definition.key === 'stress' && legacy.stress)
    ? { ...definition, visibleToPlayers: true }
    : definition));
}

interface LegacySwitches {
  takeLegacyPlayerBars(): LegacyPlayerBars | null;
}

interface Collections {
  getCollections(): Promise<Array<{ id: string; settings?: CollectionSettings }>>;
  updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void>;
}

/**
 * Carries the old player-window switches into the collections, once: every
 * collection whose HP or Stress the switches showed to players gets that
 * resource marked visible to players. The switches are gone afterwards.
 */
export async function migratePlayerResourceVisibility(settings: LegacySwitches, assets: Collections): Promise<void> {
  const legacy = settings.takeLegacyPlayerBars();
  if (!legacy || (!legacy.hp && !legacy.stress)) return;
  for (const collection of await assets.getCollections()) {
    const current = collectionResources(collection.settings ?? { conditions: [] });
    const resources = withPlayerVisibility(current, legacy);
    if (resources.some((definition, index) => definition !== current[index])) {
      await assets.updateCollectionSettings(collection.id, { resources });
    }
  }
}
