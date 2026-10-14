/** Reading the initiative modifiers of the combatants from their linked statblocks before a roll. */

import type { ModifierSources } from '../gameSystems/initiativeModifierSources';
import type { StatblockFields } from '../resources/statblockResourceSync';
import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { statblockInitiativeModifier } from './initiativeModifier';

export interface StatblockModifiers {
  /** Entry id to the modifier its statblock holds, for entries whose statblock holds one. */
  modifiers: Map<string, number>;
  /** Entries whose token links a statblock that gave no modifier (unreadable, or without the field). */
  unread: string[];
}

/** The note a token links, if any. */
function linkedNote(token: TokenEntity | undefined): string | undefined {
  return token?.kind === 'character' ? token.statblockPath?.trim() || undefined : undefined;
}

/**
 * The statblock modifiers of `entries`, reading each linked note once through `read` (the
 * statblock resolver, `readStatblockRecord`), for the map's rules' `sources`.
 */
export async function readStatblockModifiers(
  entries: readonly InitiativeEntry[],
  tokens: Readonly<Record<string, TokenEntity>>,
  sources: ModifierSources,
  read: (path: string) => Promise<StatblockFields | null>,
): Promise<StatblockModifiers> {
  const notes = new Map(entries.flatMap((entry) => {
    const note = linkedNote(tokens[entry.tokenId]);
    return note ? [[entry.id, note] as const] : [];
  }));
  const paths = [...new Set(notes.values())];
  const records = new Map(await Promise.all(paths.map(async (path) => [path, await read(path)] as const)));
  const modifiers = new Map<string, number>();
  const unread: string[] = [];
  for (const [entryId, path] of notes) {
    const statblock = records.get(path);
    const modifier = statblock ? statblockInitiativeModifier(statblock, sources) : null;
    if (modifier === null) unread.push(entryId);
    else modifiers.set(entryId, modifier);
  }
  return { modifiers, unread };
}
