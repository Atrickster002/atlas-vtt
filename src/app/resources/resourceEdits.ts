import { clampValue } from './resourceValues';
import type { ResourceHolder, ResourceValue } from './resourceTypes';

export interface ResourceMaxInput {
  key: string;
  /** undefined: follow the statblock (or remove the resource when the statblock has none). */
  max: number | undefined;
}

/** The token update for the maxima typed into Edit Token. */
export function buildResourceEdits(
  token: ResourceHolder,
  inputs: readonly ResourceMaxInput[],
  defaults: Record<string, ResourceValue>,
): { resources: Record<string, ResourceValue>; overriddenMax: string[] | undefined } {
  const resources: Record<string, ResourceValue> = { ...token.resources };
  const overridden = new Set(token.overriddenMax ?? []);
  for (const { key, max } of inputs) {
    const current = resources[key];
    const fallback = defaults[key];
    if (max === undefined) {
      overridden.delete(key);
      if (fallback) resources[key] = clampValue({ current: current?.current ?? fallback.current, max: fallback.max });
      else delete resources[key];
      continue;
    }
    resources[key] = clampValue({ current: current?.current ?? max, max });
    // Back on the statblock's value: follow it again. A new value: set by hand. Unchanged: as it was.
    if (fallback?.max === max) overridden.delete(key);
    else if (current?.max !== max) overridden.add(key);
  }
  return { resources, overriddenMax: overridden.size > 0 ? [...overridden] : undefined };
}
