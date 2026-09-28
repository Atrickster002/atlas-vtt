import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { CreatureIndex, type IndexedCreature } from './CreatureIndex';

/** The creatures of linked statblocks as a component reads them. */
export interface CreatureLookup {
  /** Undefined while the note has not been read, null when it defines no statblock. */
  get: (path: string) => IndexedCreature | null | undefined;
  /** Whether notes are still being read. */
  pending: boolean;
}

const NO_CREATURES: CreatureLookup = { get: () => undefined, pending: false };
const noSubscription = (): (() => void) => () => undefined;

/**
 * Reads the statblocks of `paths` through the app's `CreatureIndex` and
 * re-renders whenever one of them changes. Pass a stable (memoised) list.
 */
export function useCreatureIndex(app: App | null, paths: readonly string[]): CreatureLookup {
  // The index starts listening to the vault only once a statblock is needed.
  const index = app && paths.length > 0 ? CreatureIndex.forApp(app) : null;
  const revision = useSyncExternalStore(index?.subscribe ?? noSubscription, index?.getRevision ?? (() => 0));

  useEffect(() => {
    index?.request(paths);
  }, [index, paths]);

  return useMemo((): CreatureLookup => {
    if (!index) return NO_CREATURES;
    const pending = index.isPending() || paths.some((path) => index.get(path) === undefined);
    return { get: (path) => index.get(path), pending };
    // `revision` stands for the index's contents, which the lookup reads.
  }, [index, paths, revision]);
}
