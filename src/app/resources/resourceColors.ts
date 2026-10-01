import type { ResourceDefinition, ResourceValue } from './resourceTypes';

/** Below these shares of what is left, a resource that defeats its token turns yellow, then red. */
const WARN_BELOW = 0.7;
const CRITICAL_BELOW = 0.3;
const WARN_COLOR = '#eab308';
const CRITICAL_COLOR = '#ef4444';

/** The share of a resource that is left: what remains of a draining one, what is not yet used of a filling one. */
export function remainingShare(definition: ResourceDefinition, value: ResourceValue): number {
  if (!(value.max > 0)) return 0;
  const share = Math.max(0, Math.min(1, value.current / value.max));
  return definition.direction === 'drains' ? share : 1 - share;
}

/**
 * The colour a resource shows in, as `#rrggbb`. A resource that defeats its token when
 * spent warns as it runs low, the way the HP bar always did: its own colour, yellow
 * below 70%, red below 30%. Every other resource keeps its colour.
 */
export function resourceColor(definition: ResourceDefinition, value: ResourceValue): string {
  if (!definition.defeatedWhenSpent) return definition.color;
  const left = remainingShare(definition, value);
  if (left >= WARN_BELOW) return definition.color;
  return left >= CRITICAL_BELOW ? WARN_COLOR : CRITICAL_COLOR;
}
