import { statblockResourceValue } from './statblockResourceValues';
import { clampValue } from './resourceValues';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';

/**
 * A linked token's resources after its statblock changed: each defined
 * resource takes the statblock's maximum unless it was set by hand; the
 * current value is kept and clamped. A resource new to the token starts fresh.
 */
export function syncedResources(
  token: ResourceHolder,
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
): Record<string, ResourceValue> {
  const next: Record<string, ResourceValue> = { ...token.resources };
  for (const definition of definitions) {
    if (token.overriddenMax?.includes(definition.key)) continue;
    const fromStatblock = statblockResourceValue(record, definition);
    if (!fromStatblock) continue;
    const current = next[definition.key];
    next[definition.key] = current ? clampValue({ current: current.current, max: fromStatblock.max }) : fromStatblock;
  }
  return next;
}
