import type { CreatureFilterDefinition } from '../types/creatureFilterTypes';
import type { IndexedCreature } from './CreatureIndex';
import { RATING_FILTERS } from './creatureFieldCatalog';
import { alignmentParts, optionKey, parseCategories, parseOptions, parseRating } from './creatureValues';

/** What the filters need of a token. */
export interface FilterableToken {
  statblockPath?: string;
}

/** A creature's rating: its value on the first scale of `RATING_FILTERS` its statblock has. */
export interface CreatureRating {
  /** Index of the scale in `RATING_FILTERS`, so creatures group by scale. */
  scale: number;
  value: number;
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
  rating: CreatureRating | null;
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

function uniqueOptions(values: readonly unknown[], read: (value: unknown) => string[]): OptionValue[] {
  const byKey = new Map<string, OptionValue>();
  for (const label of values.flatMap(read)) {
    const key = optionKey(label);
    if (!byKey.has(key)) byKey.set(key, { key, label });
  }
  return [...byKey.values()];
}

function ratingOf(fields: Readonly<Record<string, unknown>>): CreatureRating | null {
  for (const [scale, filter] of RATING_FILTERS.entries()) {
    const value = parseRating(fields[filter.field]);
    if (value !== null) return { scale, value };
  }
  return null;
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
      const read = definition.values === 'alignment' ? alignmentParts : definition.values === 'category' ? parseCategories : parseOptions;
      options.set(definition.id, fields ? uniqueOptions(definition.fields.map((field) => fields[field]), read) : []);
    }
  }
  return { linked: Boolean(token.statblockPath), creature, rating: fields ? ratingOf(fields) : null, ratings, options };
}
