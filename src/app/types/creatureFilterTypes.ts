/**
 * Filters on the statblocks linked to a collection's tokens. A collection
 * defines which statblock fields it filters by (its game system suggests some);
 * the asset manager keeps what the user picked in a `CreatureFilterSelection`.
 */

/** A filter a collection offers on its tokens' statblocks. */
export type CreatureFilterDefinition = CreatureRangeFilter | CreatureOptionsFilter;

export type CreatureFilterKind = CreatureFilterDefinition['kind'];

interface CreatureFilterBase {
  /** Stable within the collection; the asset manager remembers selections by it. */
  id: string;
  /** Shown in the asset manager, e.g. "CR" or "Role". */
  label: string;
}

/**
 * A numeric scale such as CR, level or tier. It reads exactly one field, so two
 * scales (CR 5 and tier 5) can never be compared with each other.
 */
export interface CreatureRangeFilter extends CreatureFilterBase {
  kind: 'range';
  field: string;
}

/**
 * Categories such as type, role or source. The values of all its fields are
 * merged, for systems that spread one list over several keys (Pathfinder 2e
 * traits in `trait_01` to `trait_07`).
 */
export interface CreatureOptionsFilter extends CreatureFilterBase {
  kind: 'options';
  fields: string[];
}

/** Whether a token must have a linked statblock. */
export type StatblockLinkFilter = 'any' | 'linked' | 'unlinked';

/** What the user picked in the asset manager's filters. Empty lists and missing ranges filter nothing. */
export interface CreatureFilterSelection {
  statblock: StatblockLinkFilter;
  /** Statblock layouts (Fantasy Statblocks layout names), any of which a token's statblock must use. */
  layouts: string[];
  /** Inclusive bounds by range filter id. */
  ranges: Record<string, NumericRange>;
  /** Picked option keys by options filter id; a token needs any one of them. */
  options: Record<string, string[]>;
}

export interface NumericRange {
  min: number;
  max: number;
}

/** A selection that filters nothing. */
export function emptyCreatureSelection(): CreatureFilterSelection {
  return { statblock: 'any', layouts: [], ranges: {}, options: {} };
}
