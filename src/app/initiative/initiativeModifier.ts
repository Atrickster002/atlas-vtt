/**
 * The modifier a combatant adds to its initiative roll: the GM's own on the
 * entry, else the number its statblock holds where the map's rules read it.
 */

import type { ModifierSources } from '../gameSystems/initiativeModifierSources';
import { resolveField } from '../resources/resourceFields';
import type { StatblockFields } from '../resources/statblockResourceSync';
import type { InitiativeModifierSource } from '../types/initiativeRulesTypes';
import type { InitiativeEntry } from '../types/initiativeTypes';

/** A whole number with an optional sign; the typographic minus counts as one. */
const SIGNED_WHOLE = /^[+\-−]?\d{1,9}$/;

/** A statblock's value as a modifier: a whole number, signed or not; anything else is none. */
export function parseInitiativeModifier(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace('−', '-');
  return SIGNED_WHOLE.test(text) ? Number(text) : null;
}

/** The modifier of an ability score by the d20 rule. */
export function abilityScoreModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function readSource(statblock: StatblockFields, source: InitiativeModifierSource | undefined): number | null {
  if (!source) return null;
  const value = parseInitiativeModifier(resolveField(statblock.fields, source.field, statblock.meanings));
  return value !== null && source.abilityScore ? abilityScoreModifier(value) : value;
}

/**
 * The modifier a statblock holds where `sources` read it: the rules' field, else the field the
 * statblock's template means as initiative, else the rules' fallback (5e: DEX as a score); null
 * where none of them holds a number.
 */
export function statblockInitiativeModifier(statblock: StatblockFields, sources: ModifierSources): number | null {
  const meant = statblock.meanings?.initiative;
  return readSource(statblock, sources.modifier)
    ?? (meant ? readSource(statblock, { field: meant }) : null)
    ?? readSource(statblock, sources.modifierFallback);
}

/**
 * The GM's own modifier on an entry, set in its edit popup (`modifierByHand`), 0 included. Every
 * entry was written with a modifier of 0, which is none; any other number an older file holds
 * was the GM's and stays so.
 */
export function ownModifier(entry: Pick<InitiativeEntry, 'initiativeModifier' | 'modifierByHand'>): number | undefined {
  return entry.modifierByHand || entry.initiativeModifier !== 0 ? entry.initiativeModifier : undefined;
}

/** What a combatant adds to its roll: its own modifier, else its statblock's, else nothing. */
export function combatantModifier(own: number | undefined, fromStatblock: number | null | undefined): number {
  return own ?? fromStatblock ?? 0;
}
