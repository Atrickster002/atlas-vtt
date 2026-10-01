import type { LightEmission } from '../types/lightingTypes';
import { LIGHT_PRESETS, type LightPresetId } from './lightPresets';

export type EmissionNumberField = 'bright' | 'dim' | 'intensity' | 'sourceRadius';

const RANGES: Record<EmissionNumberField, [number, number]> = {
  bright: [0, Infinity],
  dim: [0, Infinity],
  intensity: [0, 2],
  sourceRadius: [0, 5],
};

/** The emission with one number field set, clamped to its range; bright and dim push each other so dim ≥ bright. */
export function withEmissionValue(emission: LightEmission, field: EmissionNumberField, value: number): LightEmission {
  const [min, max] = RANGES[field];
  const clamped = Math.min(max, Math.max(min, value));
  if (clamped === (emission[field] ?? null)) return emission;
  const next = { ...emission, [field]: clamped };
  if (field === 'bright' && next.dim < clamped) next.dim = clamped;
  if (field === 'dim' && next.bright > clamped) next.bright = clamped;
  return next;
}

/**
 * The emission with one number field set from what the user typed. Text that is not a
 * number keeps the emission as it was.
 */
export function editEmission(emission: LightEmission, field: EmissionNumberField, input: string): LightEmission {
  const parsed = input.trim() === '' ? NaN : Number(input);
  return Number.isFinite(parsed) ? withEmissionValue(emission, field, parsed) : emission;
}

export function emissionOfPreset(id: LightPresetId): LightEmission {
  return { ...LIGHT_PRESETS[id].emission };
}
