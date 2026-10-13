import type { App } from 'obsidian';
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { useViewStoreHook } from '../react/ViewStoreContext';
import { isBestiaryResolved } from '../services/FantasyStatblocksService';
import { readStatblockRecord } from '../statblocks/resolve/statblockRecord';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { showNotice } from '../ui/notice';
import { readStatblockModifiers } from './statblockModifiers';

interface InitiativeRolls {
  /** Rolls every combatant, or the one of `entryId`, with their statblocks' modifiers. */
  roll: (entryId?: string) => void;
  /** A roll is reading statblocks; another is not started meanwhile. */
  rolling: boolean;
}

/**
 * Initiative rolls of the tracker: the combatants' statblocks are read first, through the
 * resolver, for the modifier field the map's rules name. While Fantasy Statblocks still reads
 * the vault a statblock may not be readable yet: the roll goes ahead with what is known, and
 * the GM is told how many combatants rolled without their statblock's modifier.
 */
export function useInitiativeRolls(app: App, rules: InitiativeRules): InitiativeRolls {
  const store = useViewStoreHook();
  const mounted = useRef(true);
  const pending = useRef(false);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const rollNow = useCallback(async (entryId: string | undefined): Promise<void> => {
    const before = store.getState();
    if (before.isMapLoading) return;
    const entries = before.initiative.entries.filter((entry) => entryId === undefined || entry.id === entryId);
    if (entries.length === 0) return;
    // Asked before the read: a parse that ends meanwhile does not make what was read whole.
    const parsing = !isBestiaryResolved();
    const { modifiers, unread } = await readStatblockModifiers(entries, before.objects.tokens, rules.modifierField, async (path) => {
      const read = await readStatblockRecord(app, path);
      return read && { fields: read.record, meanings: read.meanings };
    });

    // Another scene, or the tracker gone, while the statblocks were read: nothing is rolled.
    const now = store.getState();
    if (!mounted.current || now.isMapLoading || now.mapPath !== before.mapPath) return;
    if (entryId === undefined) now.rollAllInitiative(rules.roll, modifiers);
    else now.rollEntryInitiative(entryId, rules.roll, modifiers.get(entryId) ?? null);
    // A combatant with a modifier of the GM's own missed nothing
    const missed = entries.filter((entry) => entry.initiativeModifier === 0 && unread.includes(entry.id)).length;
    if (parsing && missed > 0) showNotice(t('initiative.statblocksLoading', { count: missed }));
  }, [app, store, rules]);

  const roll = useCallback((entryId?: string): void => {
    if (pending.current) return;
    pending.current = true;
    setRolling(true);
    rollNow(entryId)
      .catch((error: unknown) => {
        console.error('[Atlas VTT] Could not read the initiative modifiers of the combatants:', error);
        showNotice(t('initiative.modifierReadError'));
      })
      .finally(() => {
        pending.current = false;
        if (mounted.current) setRolling(false);
      });
  }, [rollNow]);

  return { roll, rolling };
}
