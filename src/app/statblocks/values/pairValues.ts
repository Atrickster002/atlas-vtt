/**
 * Pairs fields as notes hold them: a record (`{ dex: 5 }`), a list of
 * one-key records (`[{ dexterity: 5 }]`, Fantasy Statblocks' saves), or text
 * items ("Stealth +5"). Names match without regard to case.
 */

import type { FieldValue } from '../model/templateTypes';
import { parseNumberText } from './numberText';

export interface Pair {
  key: string;
  value: FieldValue;
}

/** One pair as text: "Dex +5", "Perception: 4", "Str −1". */
const PAIR_TEXT = /^(.*?\S)\s*:?\s*([+\-\u2212]?\d+(?:\.\d+)?)$/;
const LETTER = /\p{L}/u;

/** A name and a number written as text, or null when the text is not one. */
export function parsePairText(text: string): { key: string; value: number } | null {
  const match = PAIR_TEXT.exec(text.trim());
  const key = match?.[1];
  const value = match?.[2] === undefined ? null : parseNumberText(match[2]);
  return key !== undefined && LETTER.test(key) && value !== null ? { key, value } : null;
}

function itemPairs(item: FieldValue | undefined): Pair[] {
  if (typeof item === 'string') {
    const text = item.trim();
    if (text === '') return [];
    return [parsePairText(text) ?? { key: text, value: null }];
  }
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
  return Object.entries(item).map(([key, value]) => ({ key, value }));
}

/** Every pair of a pairs value in written order; values that hold no pairs give none. */
export function normalisePairs(value: FieldValue | undefined): Pair[] {
  return Array.isArray(value) ? value.flatMap(itemPairs) : itemPairs(value);
}

function findPair(pairs: readonly Pair[], name: string | undefined): Pair | undefined {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  return pairs.find((pair) => pair.key.trim().toLowerCase() === wanted);
}

/**
 * The value a pairs field holds for a slot: by the slot's key ("dexterity"),
 * else by its label ("Dex"), either in any case.
 */
export function pairValue(pairs: FieldValue | undefined, slotKey: string | undefined, slotLabel?: string): FieldValue | undefined {
  const list = normalisePairs(pairs);
  return (findPair(list, slotKey) ?? findPair(list, slotLabel))?.value;
}
