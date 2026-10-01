/**
 * Expendable token resources (HP, STR, Stress, ammunition…) defined per
 * collection. A token stores one value per definition key.
 */

/** How a resource counts: `drains` starts full and goes down, `fills` starts at 0 and goes up. */
export type ResourceDirection = 'drains' | 'fills';

export type ResourceLook = 'bar' | 'badge';

export interface ResourceDefinition {
  /** Stable id derived from the name at creation; tokens key their values by it. Never renamed. */
  key: string;
  name: string;
  /** Statblock field (dotted path) that supplies the maximum, e.g. `hp`, `stats.0`, `resources.mana`. */
  field: string;
  direction: ResourceDirection;
  look: ResourceLook;
  /** `#rrggbb`. */
  color: string;
  /** Spent (0 when draining, max when filling) marks the token defeated. */
  defeatedWhenSpent?: boolean;
  visibleToPlayers: boolean;
}

/** `current` counts in the resource's direction: remaining when draining, used when filling. */
export interface ResourceValue {
  current: number;
  max: number;
}

export type ResourceViewer = 'dm' | 'player';

/** Supplies the resource definitions of the collection a map belongs to. */
export type ResourceDefsProvider = () => readonly ResourceDefinition[];

export interface VisibleResource {
  definition: ResourceDefinition;
  value: ResourceValue;
}

/** The part of a token that holds resources. */
export interface ResourceHolder {
  resources?: Record<string, ResourceValue> | undefined;
  /** Keys whose maximum was set by hand and no longer follows the statblock. */
  overriddenMax?: string[] | undefined;
}
