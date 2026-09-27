import type { CreatureFilterDefinition } from '../types/creatureFilterTypes';
import type { IndexedCreature } from './CreatureIndex';
import { optionKey, parseOptions, parseRating } from './creatureValues';

/** What the filters need of a token. */
export interface FilterableToken {
  statblockPath?: string;
  /** Size multiplier; unset is a medium token (1). */
  size?: number;
}

/** A category as it appears on a token: compared by key, shown by label. */
export interface OptionValue {
  key: string;
  label: string;
}

/** Everything a filter reads of one token, worked out once per index change. */
export interface TokenFacts {
  /** The token links a statblock note, readable or not. */
  linked: boolean;
  /** The linked note's creature; null without one, or while the note is not read yet. */
  creature: IndexedCreature | null;
  size: number;
  /** Value of every range filter, by filter id; null when the statblock does not have it. */
  ratings: ReadonlyMap<string, number | null>;
  /** Values of every options filter, by filter id; empty when the statblock has none. */
  options: ReadonlyMap<string, readonly OptionValue[]>;
}

export type CreatureLookupFn = (path: string) => IndexedCreature | null | undefined;

/** The statblock notes `tokens` link to, each once. */
export function linkedStatblockPaths(tokens: readonly Pick<FilterableToken, 'statblockPath'>[]): string[] {
  return [...new Set(tokens.flatMap((token) => (token.statblockPath ? [token.statblockPath] : [])))];
}

function uniqueOptions(values: readonly unknown[]): OptionValue[] {
  const byKey = new Map<string, OptionValue>();
  for (const label of values.flatMap(parseOptions)) {
    const key = optionKey(label);
    if (!byKey.has(key)) byKey.set(key, { key, label });
  }
  return [...byKey.values()];
}

/** The facts of one token under the collection's filter definitions. */
export function factsOf(token: FilterableToken, lookup: CreatureLookupFn, definitions: readonly CreatureFilterDefinition[]): TokenFacts {
  const creature = token.statblockPath ? lookup(token.statblockPath) ?? null : null;
  const fields = creature?.fields;
  const ratings = new Map<string, number | null>();
  const options = new Map<string, readonly OptionValue[]>();
  for (const definition of definitions) {
    if (definition.kind === 'range') {
      ratings.set(definition.id, fields ? parseRating(fields[definition.field]) : null);
    } else {
      options.set(definition.id, fields ? uniqueOptions(definition.fields.map((field) => fields[field])) : []);
    }
  }
  return { linked: Boolean(token.statblockPath), creature, size: token.size ?? 1, ratings, options };
}
