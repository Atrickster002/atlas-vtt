import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';

export function clampValue(value: ResourceValue): ResourceValue {
  const max = Math.max(0, value.max);
  return { current: Math.max(0, Math.min(max, value.current)), max };
}

export function withCurrent(value: ResourceValue, current: number): ResourceValue {
  return clampValue({ current: Number.isFinite(current) ? current : value.current, max: value.max });
}

/** A fresh value: full when the resource drains, empty when it fills. */
export function startingValue(definition: ResourceDefinition, max: number): ResourceValue {
  return { current: definition.direction === 'drains' ? max : 0, max };
}

/** Used up: 0 when draining, full when filling. A value without a maximum is never spent. */
export function isSpent(definition: ResourceDefinition, value: ResourceValue): boolean {
  if (value.max <= 0) return false;
  return definition.direction === 'drains' ? value.current <= 0 : value.current >= value.max;
}

export function isDefeated(token: ResourceHolder, definitions: readonly ResourceDefinition[]): boolean {
  return definitions.some((definition) => {
    const value = token.resources?.[definition.key];
    return definition.defeatedWhenSpent === true && value !== undefined && isSpent(definition, value);
  });
}

/** The token update that sets one resource; a hand-set maximum is remembered in `overriddenMax`. */
export function resourceUpdate(
  token: ResourceHolder,
  key: string,
  next: ResourceValue,
  maxEdited: boolean,
): { resources: Record<string, ResourceValue>; overriddenMax?: string[] } {
  const resources = { ...token.resources, [key]: clampValue(next) };
  const overridden = token.overriddenMax ?? [];
  if (!maxEdited || overridden.includes(key)) return { resources };
  return { resources, overriddenMax: [...overridden, key] };
}
