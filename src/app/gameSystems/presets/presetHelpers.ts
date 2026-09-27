import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { CreatureFilterDefinition, CreatureOptionsFilter, CreatureRangeFilter } from '../../types/creatureFilterTypes';
import { BUILT_IN_ID_PREFIX } from '../../types/systemPresetTypes';

/** A condition as a built-in preset defines it; the id is derived from the preset and the name. */
export type BuiltInCondition = Omit<ConditionDefinition, 'id'>;

/** The id of a built-in preset. Never change it: collections record it. */
export function builtInPresetId(presetKey: string): string {
  return `${BUILT_IN_ID_PREFIX}${presetKey}`;
}

/** Conditions with ids derived from the preset and their name. Never change them: tokens record them. */
export function conditionsOf(presetKey: string, conditions: readonly BuiltInCondition[]): ConditionDefinition[] {
  return conditions.map((condition) => ({
    id: `${presetKey}-${condition.name.toLowerCase().replace(/\s+/g, '-')}`,
    ...condition,
  }));
}

/** A creature filter as a built-in preset defines it; the id is derived from the preset and the field. */
export type BuiltInCreatureFilter = Omit<CreatureRangeFilter, 'id'> | Omit<CreatureOptionsFilter, 'id'>;

/** Creature filters with ids derived from the preset and their (first) field. Never change them: the asset manager remembers picks by id. */
export function creatureFiltersOf(presetKey: string, filters: readonly BuiltInCreatureFilter[]): CreatureFilterDefinition[] {
  return filters.map((filter) => ({ id: `${presetKey}-${filter.kind === 'range' ? filter.field : filter.fields[0]}`, ...filter }));
}
