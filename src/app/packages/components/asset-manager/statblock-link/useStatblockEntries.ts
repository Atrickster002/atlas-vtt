import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { bestiaryLookup, unparsedStatblockNotes } from '../../../../creatures/linkedCreature';
import type { FantasyStatblocksCreature } from '../../../../services/FantasyStatblocksService';
import { useBestiaryRevision } from '../../../../react/hooks/useBestiaryRevision';
import { statblockEntries, type StatblockEntry } from './statblockEntries';

export type BestiaryStatus = 'missing' | 'loading' | 'ready';

export interface StatblockEntries {
  entries: StatblockEntry[];
  status: BestiaryStatus;
}

/**
 * The linkable creatures: Fantasy Statblocks' note-backed bestiary entries at
 * once, and the statblock notes it never parsed (```statblock fences) once the
 * vault is read. Both are kept current while the bestiary (re)parses.
 */
export function useStatblockEntries(app: App): StatblockEntries {
  const revision = useBestiaryRevision(app);
  // `revision` is not read here; it re-reads the bestiary whenever it changes.
  const bestiary = useMemo(() => bestiaryLookup(), [revision]);
  // The previous read stays listed while the vault is read again.
  const [notes, setNotes] = useState<FantasyStatblocksCreature[] | null>(null);

  useEffect(() => {
    if (!bestiary.api) return;
    let cancelled = false;
    void unparsedStatblockNotes(app, bestiary)
      .then((creatures) => { if (!cancelled) setNotes(creatures); })
      .catch((error: unknown) => {
        console.error('[StatblockLink] Could not read the statblock notes:', error);
        if (!cancelled) setNotes([]);
      });
    return () => { cancelled = true; };
  }, [app, bestiary]);

  return useMemo((): StatblockEntries => {
    const { api, byPath } = bestiary;
    if (!api) return { entries: [], status: 'missing' };
    // A previous read may list a note the bestiary has parsed since.
    const unparsed = (notes ?? []).filter((creature) => !creature.path || !byPath.has(creature.path));
    const entries = statblockEntries([...byPath.values(), ...unparsed]);
    // The bestiary is parsed asynchronously at startup: empty and unresolved means "not ready yet".
    const status = entries.length === 0 && (notes === null || !api.isResolved?.()) ? 'loading' : 'ready';
    return { entries, status };
  }, [bestiary, notes]);
}
