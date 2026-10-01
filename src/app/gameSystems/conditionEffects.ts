import type { ConditionDefinition, ConditionEffect } from '../types/collectionSettingsTypes';
import { BUILT_IN_SYSTEM_PRESETS } from './builtInPresets';

/** The effects of the built-in conditions, by their ids, which never change. */
const BUILT_IN_EFFECTS: ReadonlyMap<string, ConditionEffect> = new Map(
  BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.conditions)
    .flatMap((condition) => (condition.effect ? [[condition.id, condition.effect] as const] : [])),
);

/**
 * What a condition does to sight: the effect it sets, else that of the built-in condition whose
 * id it has. Collections hold copies of their system's conditions, and those copied before
 * effects existed carry none. Everything that reads an effect reads it here.
 */
export function conditionEffect(condition: Pick<ConditionDefinition, 'id' | 'effect'>): ConditionEffect | undefined {
  return condition.effect ?? BUILT_IN_EFFECTS.get(condition.id);
}
