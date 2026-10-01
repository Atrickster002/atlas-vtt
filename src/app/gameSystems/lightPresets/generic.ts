import { LIGHT_PRESETS, LIGHT_PRESET_IDS } from '../../lighting/lightPresets';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';

/**
 * The lights of a collection without a game system, and of a system whose rules name none:
 * the four Atlas always had, under the ids placed lights record as their kind.
 */
export const GENERIC_LIGHT_PRESETS: readonly LightPresetDefinition[] = LIGHT_PRESET_IDS.map((id) => {
  const { label, emission } = LIGHT_PRESETS[id];
  const { intensity, sourceRadius, ...light } = emission;
  return {
    id,
    name: label,
    ...light,
    kind: id,
    ...(sourceRadius !== undefined && { sourceRadius }),
    ...(intensity !== 1 && { intensity }),
  };
});
