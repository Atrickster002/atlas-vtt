import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { collectionCreatureFilters } from '../../../../gameSystems/systemRules';
import { useSystemPresets } from '../../../../react/hooks/useSystemPresets';
import type { AssetService } from '../../../../services/AssetService';
import type { CreatureFilterDefinition } from '../../../../types/creatureFilterTypes';

const NO_FILTERS: CreatureFilterDefinition[] = [];

/** The creature filters a collection offers, kept current as its settings are saved; none without a collection. */
export function useCollectionFilterDefinitions(
  app: App,
  assetService: AssetService | null,
  collectionId: string | null,
): CreatureFilterDefinition[] {
  const { presets } = useSystemPresets(app);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changed) => {
      if (changed === collectionId) setRevision((value) => value + 1);
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);

  return useMemo(() => {
    if (!assetService || !collectionId) return NO_FILTERS;
    return collectionCreatureFilters(assetService.getCollectionSettings(collectionId), presets);
    // `revision` stands for the collection settings, which are read here.
  }, [assetService, collectionId, presets, revision]);
}
