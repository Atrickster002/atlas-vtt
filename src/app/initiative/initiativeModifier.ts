/**
 * The modifier a combatant adds to its initiative roll: the GM's own on the
 * entry, else the number its statblock holds in the collection's field.
 */

import { resolveField } from '../resources/resourceFields';
import type { StatblockFields } from '../resources/statblockResourceSync';

/** A whole number with an optional sign; the typographic minus counts as one. */
const SIGNED_WHOLE = /^[+\-−]?\d{1,9}$/;

/** A statblock's value as a modifier: a whole number, signed or not; anything else is none. */
export function parseInitiativeModifier(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace('−', '-');
  return SIGNED_WHOLE.test(text) ? Number(text) : null;
}

/**
 * The modifier a statblock holds in `field` (a dotted path), or in the field its template means
 * as initiative where none is chosen; null where it holds none that reads as a modifier.
 */
export function statblockInitiativeModifier(statblock: StatblockFields, field: string | undefined): number | null {
  const path = field?.trim() || statblock.meanings?.initiative;
  return path ? parseInitiativeModifier(resolveField(statblock.fields, path, statblock.meanings)) : null;
}

/**
 * What a combatant adds to its roll. A modifier on the entry is the GM's own (Atlas never writes
 * one) and wins; without one the statblock's counts, and where the statblock gives none the
 * entry keeps its own, never replaced by 0.
 */
export function combatantModifier(own: number, fromStatblock: number | null | undefined): number {
  return own !== 0 ? own : fromStatblock ?? own;
}
