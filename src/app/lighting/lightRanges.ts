import type { LightEmission } from '../types/lightingTypes';
import { withEmissionValue } from './lightEmissionForm';

/** The two ranges of a light: full light up to `bright`, fading out to `dim`. */
export type RangeField = 'bright' | 'dim';

export const RANGE_FIELDS: readonly RangeField[] = ['bright', 'dim'];

/**
 * The emission after its `field` ring was dragged to `units` game units from the light. The
 * radius snaps to whole units, or to tenths with `free` (Alt held); dim never ends below bright:
 * the dragged ring takes the other along.
 */
export function dragRange(emission: LightEmission, field: RangeField, units: number, free: boolean): LightEmission {
  const precision = free ? 10 : 1;
  return withEmissionValue(emission, field, Math.round(Math.max(0, units) * precision) / precision);
}

/** A range for display: whole numbers as they are, others with one decimal. */
export function formatRange(units: number): string {
  return String(Math.round(units * 10) / 10);
}

/** How far the range sliders reach, in cells. */
const SLIDER_CELLS = 24;

/**
 * The scale of the range slider for a map whose cells span `unitDistance` game units: 24 cells
 * (120 ft on a 5 ft grid), or as far as the light already reaches, in steps of one unit, or of
 * half a unit where a cell spans less than two.
 */
export function rangeSliderScale(unitDistance: number, dim: number): { max: number; step: number } {
  const step = unitDistance < 2 ? 0.5 : 1;
  const max = Math.max(SLIDER_CELLS * unitDistance, Math.ceil(dim / step) * step);
  return { max, step };
}
