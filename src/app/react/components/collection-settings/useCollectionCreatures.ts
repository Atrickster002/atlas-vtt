import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';
import { linkedStatblockPaths } from '../../../creatures/creatureFacts';
import { useCreatureIndex } from '../../../creatures/useCreatureIndex';
import type { AssetService } from '../../../services/AssetService';

export interface CollectionCreatures {
  /** The readable statblocks linked to the collection's tokens, once per note. */
  creatures: IndexedCreature[];
  /** Whether tokens or statblocks are still being read. */
  pending: boolean;
}

const NO_PATHS: readonly string[] = [];

/** The statblocks linked to a collection's tokens, read while `active`. */
export function useCollectionCreatures(
  app: App | null,
  assetService: AssetService | null,
  collectionId: string,
  active: boolean,
): CollectionCreatures {
  const [paths, setPaths] = useState<string[] | null>(null);

  useEffect(() => {
    if (!active || !assetService) return;
    let cancelled = false;
    setPaths(null);
    assetService.getAssets(collectionId, 'token').then((tokens) => {
      if (!cancelled) setPaths(linkedStatblockPaths(tokens));
    }).catch((error: unknown) => {
      console.error('[useCollectionCreatures] Could not list the collection\'s tokens:', error);
      if (!cancelled) setPaths([]);
    });
    return () => { cancelled = true; };
  }, [active, assetService, collectionId]);

  const lookup = useCreatureIndex(active ? app : null, paths ?? NO_PATHS);
  const creatures = useMemo(
    () => (paths ?? NO_PATHS).map((path) => lookup.get(path)).filter((creature): creature is IndexedCreature => Boolean(creature)),
    [paths, lookup],
  );
  return { creatures, pending: paths === null || lookup.pending };
}
