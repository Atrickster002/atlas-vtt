import { parseResourceValue, resolveField } from './resourceFields';
import { startingValue } from './resourceValues';
import type { ResourceDefinition, ResourceValue } from './resourceTypes';

/** The starting value a statblock gives one resource, or null when its field holds no quantity. */
export function statblockResourceValue(
  record: Readonly<Record<string, unknown>>,
  definition: ResourceDefinition,
): ResourceValue | null {
  const parsed = parseResourceValue(resolveField(record, definition.field));
  return parsed && parsed.max > 0 ? startingValue(definition, parsed.max) : null;
}

export function startingResources(
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
): Record<string, ResourceValue> {
  const values: Record<string, ResourceValue> = {};
  for (const definition of definitions) {
    const value = statblockResourceValue(record, definition);
    if (value) values[definition.key] = value;
  }
  return values;
}
