/** Immutable edits of a `CreatureFilterSelection`, as the asset manager's filter controls make them. */

import type {
  CreatureFilterDefinition,
  CreatureFilterSelection,
  NumericRange,
  StatblockLinkFilter,
} from '../types/creatureFilterTypes';

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

/** `record` without `key`, or with it set to `value`. */
function withEntry<T>(record: Record<string, T>, key: string, value: T | null): Record<string, T> {
  const next = { ...record };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

export function withStatblockFilter(selection: CreatureFilterSelection, statblock: StatblockLinkFilter): CreatureFilterSelection {
  return { ...selection, statblock };
}

export function toggleLayout(selection: CreatureFilterSelection, layout: string): CreatureFilterSelection {
  return { ...selection, layouts: toggled(selection.layouts, layout) };
}

export function toggleOption(selection: CreatureFilterSelection, filterId: string, key: string): CreatureFilterSelection {
  const picked = toggled(selection.options[filterId] ?? [], key);
  return { ...selection, options: withEntry(selection.options, filterId, picked.length > 0 ? picked : null) };
}

/** Sets a range filter's bounds; null, or bounds spanning every value in view, stop it filtering. */
export function withRange(
  selection: CreatureFilterSelection,
  filterId: string,
  range: NumericRange | null,
  domain?: NumericRange,
): CreatureFilterSelection {
  const spansDomain = range !== null && domain !== undefined && range.min <= domain.min && range.max >= domain.max;
  return { ...selection, ranges: withEntry(selection.ranges, filterId, spansDomain ? null : range) };
}

/** Clears the filters of one facet: `statblock`, `layouts`, or a filter id. */
export function clearFacet(selection: CreatureFilterSelection, facet: string): CreatureFilterSelection {
  if (facet === 'statblock') return { ...selection, statblock: 'any' };
  if (facet === 'layouts') return { ...selection, layouts: [] };
  return { ...selection, ranges: withEntry(selection.ranges, facet, null), options: withEntry(selection.options, facet, null) };
}

/** The selection with only its statblock link filter left, the one the sidebar does not show. */
export function withoutFieldFilters(selection: CreatureFilterSelection): CreatureFilterSelection {
  return { ...selection, layouts: [], ranges: {}, options: {} };
}

/** How many filters narrow the list: one per facet with something picked. */
export function activeFilterCount(selection: CreatureFilterSelection, definitions: readonly CreatureFilterDefinition[]): number {
  let count = (selection.statblock === 'any' ? 0 : 1) + (selection.layouts.length > 0 ? 1 : 0);
  for (const definition of definitions) {
    if (definition.kind === 'range' ? selection.ranges[definition.id] : selection.options[definition.id]?.length) count++;
  }
  return count;
}

/**
 * The selection without picks for filters the collection no longer defines (or
 * defines with another kind). Returns `selection` itself when nothing goes.
 */
export function pruneSelection(selection: CreatureFilterSelection, definitions: readonly CreatureFilterDefinition[]): CreatureFilterSelection {
  const rangeIds = new Set(definitions.filter((definition) => definition.kind === 'range').map((definition) => definition.id));
  const optionIds = new Set(definitions.filter((definition) => definition.kind === 'options').map((definition) => definition.id));
  const staleRanges = Object.keys(selection.ranges).filter((id) => !rangeIds.has(id));
  const staleOptions = Object.keys(selection.options).filter((id) => !optionIds.has(id));
  if (staleRanges.length === 0 && staleOptions.length === 0) return selection;
  const ranges = { ...selection.ranges };
  const options = { ...selection.options };
  for (const id of staleRanges) delete ranges[id];
  for (const id of staleOptions) delete options[id];
  return { ...selection, ranges, options };
}
