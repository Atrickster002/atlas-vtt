import type { LightPresetDefinition } from '../../types/lightPresetTypes';

/** A light as a built-in table defines it; the id is derived from the preset and the light's key. */
export type BuiltInLight = Omit<LightPresetDefinition, 'id'>;

/**
 * Lights with ids made like condition ids: the preset's key, a hyphen, their own key
 * (`dnd5e-torch`). Never change a key: lights on maps and tokens record the ids.
 */
export function lightsOf(presetKey: string, lights: Readonly<Record<string, BuiltInLight>>): readonly LightPresetDefinition[] {
  return Object.entries(lights).map(([key, light]) => ({ id: `${presetKey}-${key}`, ...light }));
}

// The looks the tables share, so a torch is the same flame in every system.
export const CANDLE_LOOK = { color: '#ffb347', animation: 'candle', kind: 'candle', sourceRadius: 1, intensity: 0.9 } as const;
export const TORCH_LOOK = { color: '#ff9a3c', animation: 'torch', kind: 'torch', sourceRadius: 2 } as const;
export const LANTERN_LOOK = { color: '#ffd28a', animation: 'none', kind: 'lantern', sourceRadius: 1.5 } as const;
/** A spell's light: cool, with a slow shimmer. */
export const SPELL_LOOK = { color: '#8fb8ff', animation: 'magic', kind: 'magical', sourceRadius: 2.5 } as const;
/** A magical light that burns steadily and warm, like an everburning flame. */
export const STEADY_MAGIC_LOOK = { color: '#fff1d6', animation: 'none', kind: 'magical', sourceRadius: 2 } as const;
