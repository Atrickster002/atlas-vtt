/**
 * Pure operations on a collection's game system rules: reading them from the
 * settings, applying a preset, comparing and describing them.
 */

import type {
  CollectionGridDefaults,
  CollectionSettings,
  ConditionDefinition,
  GridUnitType,
} from '../types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../types/creatureFilterTypes';
import type { SystemPreset, SystemRules } from '../types/systemPresetTypes';
import type { AnyWidget } from '../types/widgetTypes';
import { parseCreatureFilters, sameCreatureFilters } from './creatureFilters';

/** Measurement of a collection that never set any: 5-foot squares, every diagonal counts 1. */
export const DEFAULT_GRID_DEFAULTS: Readonly<CollectionGridDefaults> = {
  unitType: 'feet',
  unitDistance: 5,
  measurementMode: 'metric',
  abstractRangeBands: [],
  diagonalRule: 'equidistant',
};

/** What a game system sets in a collection's settings. */
export type SystemSettings = Required<Pick<CollectionSettings, 'gridDefaults' | 'conditions' | 'defaultWidgets' | 'creatureFilters'>>
  & Pick<CollectionSettings, 'systemPresetId'>;

/** A collection without a game system: default measurement, no conditions, no default widgets, no creature filters. */
export function vanillaSystemSettings(): SystemSettings {
  return {
    gridDefaults: structuredClone(DEFAULT_GRID_DEFAULTS),
    conditions: [],
    defaultWidgets: {},
    creatureFilters: [],
    systemPresetId: undefined,
  };
}

/**
 * The rules a collection gets from a preset: a copy of its measurement, of its
 * conditions with their own ids and of its creature filters. Conditions from the
 * previous system never carry over; the ones tokens still have are removed when
 * the collection is saved.
 */
export function rulesOfPreset(preset: SystemPreset): Required<Pick<SystemRules, 'gridDefaults' | 'conditions' | 'defaultWidgets' | 'creatureFilters'>> {
  return {
    gridDefaults: structuredClone(preset.rules.gridDefaults),
    conditions: structuredClone(preset.rules.conditions),
    defaultWidgets: { ...preset.rules.defaultWidgets },
    creatureFilters: structuredClone(preset.rules.creatureFilters ?? []),
  };
}

function sameGridDefaults(a: CollectionGridDefaults, b: CollectionGridDefaults): boolean {
  const bandsA = a.abstractRangeBands ?? [];
  const bandsB = b.abstractRangeBands ?? [];
  return a.unitType === b.unitType
    && a.unitDistance === b.unitDistance
    && a.measurementMode === b.measurementMode
    && (a.diagonalRule ?? 'equidistant') === (b.diagonalRule ?? 'equidistant')
    && bandsA.length === bandsB.length
    && bandsA.every((band, i) => band.name === bandsB[i]!.name && band.maxSquares === bandsB[i]!.maxSquares);
}

function sameCondition(a: ConditionDefinition, b: ConditionDefinition): boolean {
  return a.name === b.name
    && a.color.toLowerCase() === b.color.toLowerCase()
    && a.icon === b.icon
    && (a.valued ?? false) === (b.valued ?? false);
}

/** The default widgets that are on, as a comparable key. */
function enabledWidgets(defaultWidgets: Record<string, boolean> | undefined): string {
  return Object.keys(defaultWidgets ?? {}).filter((key) => defaultWidgets?.[key]).sort().join();
}

/** Whether two rule sets play the same; condition and filter ids do not matter. */
export function sameSystemRules(a: SystemRules, b: SystemRules): boolean {
  return sameGridDefaults(a.gridDefaults, b.gridDefaults)
    && enabledWidgets(a.defaultWidgets) === enabledWidgets(b.defaultWidgets)
    && a.conditions.length === b.conditions.length
    && a.conditions.every((condition, i) => sameCondition(condition, b.conditions[i]!))
    && sameCreatureFilters(a.creatureFilters, b.creatureFilters);
}

const SQUARE_UNIT: Record<GridUnitType, string> = { feet: 'ft', yards: 'yd', meters: 'm', units: 'unit', custom: 'unit' };

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** One-line summary, e.g. "5 ft squares · 15 conditions" or "4 range bands · 10 conditions · Torch timer". */
export function describeSystemRules(rules: SystemRules): string {
  const grid = rules.gridDefaults;
  const measurement = grid.measurementMode === 'abstract'
    ? count(grid.abstractRangeBands?.length ?? 0, 'range band')
    : `${grid.unitDistance} ${SQUARE_UNIT[grid.unitType]} squares`;
  const widgets = (rules.widgets ?? []).map((widget) => `${widget.label} ${widget.type}`);
  return [measurement, count(rules.conditions.length, 'condition'), ...widgets].join(' · ');
}

/**
 * The collection's widgets with exactly the widgets of its game system: widgets
 * any preset adds are removed unless the current preset has them, and the
 * current preset's are added after the others when missing (a running timer
 * keeps its time). Widgets the user made stay. Returns `current` when nothing
 * changes.
 */
export function withSystemWidgets(
  current: Record<string, AnyWidget>,
  presets: readonly SystemPreset[],
  presetId: string | undefined,
): Record<string, AnyWidget> {
  const wanted = presets.find((preset) => preset.id === presetId)?.rules.widgets ?? [];
  const wantedIds = new Set(wanted.map((widget) => widget.id));
  const presetIds = new Set(presets.flatMap((preset) => preset.rules.widgets ?? []).map((widget) => widget.id));
  const stale = Object.keys(current).filter((id) => presetIds.has(id) && !wantedIds.has(id));
  const missing = wanted.filter((widget) => !current[widget.id]);
  if (stale.length === 0 && missing.length === 0) return current;

  const result = { ...current };
  for (const id of stale) delete result[id];
  let order = Math.max(-1, ...Object.values(result).map((widget) => widget.order)) + 1;
  for (const widget of missing) result[widget.id] = { ...structuredClone(widget), scope: 'collection', order: order++ };
  return result;
}

/**
 * The preset the rules are set from: the recorded one while it exists (the rules
 * may have been edited since), otherwise the first whose rules they match.
 */
export function findActivePreset(
  presets: readonly SystemPreset[],
  presetId: string | undefined,
  rules: SystemRules,
): SystemPreset | undefined {
  return presets.find((preset) => preset.id === presetId)
    ?? presets.find((preset) => sameSystemRules(preset.rules, rules));
}

/**
 * The creature filters a collection offers. A collection saved before filters
 * existed has none stored and offers those of the preset it plays (recorded, or
 * matched by its other rules), so it keeps matching that preset instead of
 * showing as edited.
 */
export function collectionCreatureFilters(
  settings: Partial<Pick<CollectionSettings, 'gridDefaults' | 'conditions' | 'defaultWidgets' | 'creatureFilters' | 'systemPresetId'>>,
  presets: readonly SystemPreset[],
): CreatureFilterDefinition[] {
  if (settings.creatureFilters !== undefined) return parseCreatureFilters(settings.creatureFilters);
  const rules: SystemRules = {
    gridDefaults: settings.gridDefaults ?? DEFAULT_GRID_DEFAULTS,
    conditions: settings.conditions ?? [],
    ...(settings.defaultWidgets && { defaultWidgets: settings.defaultWidgets }),
  };
  const preset = presets.find((candidate) => candidate.id === settings.systemPresetId)
    ?? presets.find((candidate) => sameSystemRules(candidate.rules, { ...rules, creatureFilters: candidate.rules.creatureFilters ?? [] }));
  return structuredClone(preset?.rules.creatureFilters ?? []);
}
