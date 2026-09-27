/**
 * Faceted filtering of tokens by their statblocks. Options within one filter
 * are alternatives, filters narrow each other. Each facet counts the tokens
 * the other filters leave, so picking "Beast" does not zero the other types.
 * A token without the data an active filter reads is hidden, and counted in
 * `hidden` so the list can say why.
 */

import type {
  CreatureFilterDefinition,
  CreatureFilterSelection,
  CreatureOptionsFilter,
  CreatureRangeFilter,
  NumericRange,
} from '../types/creatureFilterTypes';
import type { OptionValue, TokenFacts } from './creatureFacts';

export interface FacetOption extends OptionValue {
  /** Tokens it would show, given the other filters. */
  count: number;
  selected: boolean;
}

export interface RangeFacet {
  definition: CreatureRangeFilter;
  /** Every value the tokens in view have, ascending, with the tokens the other filters leave at each. */
  values: ReadonlyArray<{ value: number; count: number }>;
  selected: NumericRange | null;
}

export interface OptionsFacet {
  definition: CreatureOptionsFilter;
  options: readonly FacetOption[];
}

export interface CreatureFacets {
  statblock: { any: number; linked: number; unlinked: number };
  layouts: readonly FacetOption[];
  sizes: ReadonlyArray<{ size: number; count: number; selected: boolean }>;
  ranges: readonly RangeFacet[];
  options: readonly OptionsFacet[];
}

/** Tokens hidden only because they lack what a filter reads. */
export interface HiddenSummary {
  withoutStatblock: number;
  /** By filter, for tokens whose statblock lacks the field. */
  withoutField: ReadonlyArray<{ id: string; label: string; count: number }>;
}

export interface CreatureFilterResult {
  /** Whether each token passes, in the order of the facts. */
  passes: readonly boolean[];
  facets: CreatureFacets;
  hidden: HiddenSummary;
}

type Outcome = 'pass' | 'fail' | 'missing';

interface Check {
  id: string;
  test: (facts: TokenFacts) => Outcome;
}

const STATBLOCK = 'statblock';
const LAYOUTS = 'layouts';
const SIZES = 'sizes';
const fieldCheckId = (definitionId: string): string => `field:${definitionId}`;

const outcome = (passes: boolean): Outcome => (passes ? 'pass' : 'fail');

/** "Level 2" before "Level 10"; case and accents do not matter. */
const LABEL_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The checks the selection makes; filters that pick nothing make none. */
function activeChecks(definitions: readonly CreatureFilterDefinition[], selection: CreatureFilterSelection): Check[] {
  const checks: Check[] = [];
  if (selection.statblock !== 'any') {
    const wanted = selection.statblock === 'linked';
    checks.push({ id: STATBLOCK, test: (facts) => outcome(facts.linked === wanted) });
  }
  if (selection.layouts.length > 0) {
    const layouts = new Set(selection.layouts);
    checks.push({
      id: LAYOUTS,
      test: (facts) => (facts.creature?.layout ? outcome(layouts.has(facts.creature.layout)) : 'missing'),
    });
  }
  if (selection.sizes.length > 0) {
    const sizes = new Set(selection.sizes);
    checks.push({ id: SIZES, test: (facts) => outcome(sizes.has(facts.size)) });
  }
  for (const definition of definitions) {
    if (definition.kind === 'range') {
      const range = selection.ranges[definition.id];
      if (!range) continue;
      checks.push({
        id: fieldCheckId(definition.id),
        test: (facts) => {
          const value = facts.ratings.get(definition.id);
          return value == null ? 'missing' : outcome(value >= range.min && value <= range.max);
        },
      });
    } else {
      const picked = selection.options[definition.id];
      if (!picked?.length) continue;
      const keys = new Set(picked);
      checks.push({
        id: fieldCheckId(definition.id),
        test: (facts) => {
          const values = facts.options.get(definition.id) ?? [];
          return values.length === 0 ? 'missing' : outcome(values.some((value) => keys.has(value.key)));
        },
      });
    }
  }
  return checks;
}

/** Tokens a facet counts: those failing no check, or only its own. */
function counted(failures: ReadonlyArray<readonly string[]>, checkId: string): (index: number) => boolean {
  return (index) => {
    const failed = failures[index] ?? [];
    return failed.length === 0 || (failed.length === 1 && failed[0] === checkId);
  };
}

/** Options by how often they occur among all tokens in view (so they keep their place as filters change), then by name. */
function optionFacet(
  facts: readonly TokenFacts[],
  valuesOf: (facts: TokenFacts) => readonly OptionValue[],
  isCounted: (index: number) => boolean,
  selected: readonly string[],
): FacetOption[] {
  const byKey = new Map<string, { labels: Map<string, number>; total: number; count: number }>();
  facts.forEach((token, index) => {
    for (const { key, label } of valuesOf(token)) {
      const entry = byKey.get(key) ?? { labels: new Map<string, number>(), total: 0, count: 0 };
      entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
      entry.total++;
      if (isCounted(index)) entry.count++;
      byKey.set(key, entry);
    }
  });
  for (const key of selected) {
    if (!byKey.has(key)) byKey.set(key, { labels: new Map([[key, 1]]), total: 0, count: 0 });
  }
  const chosen = new Set(selected);
  const options = [...byKey.entries()].map(([key, entry]) => ({
    option: {
      key,
      // The spelling most tokens use.
      label: [...entry.labels.entries()].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      count: entry.count,
      selected: chosen.has(key),
    },
    total: entry.total,
  }));
  options.sort((a, b) => b.total - a.total || LABEL_ORDER.compare(a.option.label, b.option.label));
  return options.map(({ option }) => option);
}

function rangeFacet(facts: readonly TokenFacts[], definition: CreatureRangeFilter, isCounted: (index: number) => boolean, selected: NumericRange | undefined): RangeFacet {
  const counts = new Map<number, number>();
  facts.forEach((token, index) => {
    const value = token.ratings.get(definition.id);
    if (value == null) return;
    counts.set(value, (counts.get(value) ?? 0) + (isCounted(index) ? 1 : 0));
  });
  const values = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
  return { definition, values, selected: selected ?? null };
}

function hiddenSummary(
  facts: readonly TokenFacts[],
  outcomes: ReadonlyArray<ReadonlyArray<[string, Outcome]>>,
  definitions: readonly CreatureFilterDefinition[],
): HiddenSummary {
  let withoutStatblock = 0;
  const withoutField = new Map<string, number>();
  facts.forEach((token, index) => {
    const failed = (outcomes[index] ?? []).filter(([, result]) => result !== 'pass');
    if (failed.length === 0 || failed.some(([, result]) => result === 'fail')) return;
    if (!token.creature) {
      withoutStatblock++;
      return;
    }
    const first = failed[0]?.[0];
    if (first) withoutField.set(first, (withoutField.get(first) ?? 0) + 1);
  });
  return {
    withoutStatblock,
    withoutField: definitions.flatMap(({ id, label }) => {
      const count = withoutField.get(fieldCheckId(id));
      return count ? [{ id, label, count }] : [];
    }),
  };
}

/** Filters the tokens and counts what each facet would show. */
export function evaluateCreatureFilters(
  facts: readonly TokenFacts[],
  definitions: readonly CreatureFilterDefinition[],
  selection: CreatureFilterSelection,
): CreatureFilterResult {
  const checks = activeChecks(definitions, selection);
  const outcomes = facts.map((token) => checks.map((check): [string, Outcome] => [check.id, check.test(token)]));
  const failures = outcomes.map((results) => results.filter(([, result]) => result !== 'pass').map(([id]) => id));
  const passes = failures.map((failed) => failed.length === 0);

  const statblockCounted = counted(failures, STATBLOCK);
  const statblock = { any: 0, linked: 0, unlinked: 0 };
  facts.forEach((token, index) => {
    if (!statblockCounted(index)) return;
    statblock.any++;
    statblock[token.linked ? 'linked' : 'unlinked']++;
  });

  const layouts = optionFacet(
    facts,
    (token) => (token.creature?.layout ? [{ key: token.creature.layout, label: token.creature.layout }] : []),
    counted(failures, LAYOUTS),
    selection.layouts,
  );

  const sizesCounted = counted(failures, SIZES);
  const sizeCounts = new Map<number, number>();
  facts.forEach((token, index) => sizeCounts.set(token.size, (sizeCounts.get(token.size) ?? 0) + (sizesCounted(index) ? 1 : 0)));
  for (const size of selection.sizes) if (!sizeCounts.has(size)) sizeCounts.set(size, 0);
  const sizes = [...sizeCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([size, count]) => ({ size, count, selected: selection.sizes.includes(size) }));

  const ranges: RangeFacet[] = [];
  const options: OptionsFacet[] = [];
  for (const definition of definitions) {
    const isCounted = counted(failures, fieldCheckId(definition.id));
    if (definition.kind === 'range') {
      ranges.push(rangeFacet(facts, definition, isCounted, selection.ranges[definition.id]));
    } else {
      options.push({
        definition,
        options: optionFacet(facts, (token) => token.options.get(definition.id) ?? [], isCounted, selection.options[definition.id] ?? []),
      });
    }
  }

  return {
    passes,
    facets: { statblock, layouts, sizes, ranges, options },
    hidden: hiddenSummary(facts, outcomes, definitions),
  };
}
