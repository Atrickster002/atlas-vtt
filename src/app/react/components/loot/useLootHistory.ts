import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { LootHistoryStore } from '../../../loot/LootHistoryStore';
import type { LootRoll } from '../../../loot/lootHistory';

const NO_ROLLS: readonly LootRoll[] = [];

/** Every roll of the collection, newest first, updated as any of its maps rolls. */
export function useLootHistory(app: App, collectionId: string | null): readonly LootRoll[] {
  const [rolls, setRolls] = useState<readonly LootRoll[]>(NO_ROLLS);

  useEffect(() => {
    if (!collectionId) {
      setRolls(NO_ROLLS);
      return;
    }
    let cancelled = false;
    const store = LootHistoryStore.forApp(app);
    void store.load(collectionId).then((loaded) => {
      if (!cancelled) setRolls(loaded);
    });
    const unsubscribe = store.subscribe(collectionId, setRolls);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [app, collectionId]);

  return rolls;
}
