import type { LightAnimation, LightKind } from './lightingTypes';

/**
 * A light a game system's rules name (a torch, a hooded lantern, the Light spell), offered
 * wherever a light is chosen. Distances are game units of the collection; a system that
 * measures in bands names its presets by the band they reach.
 */
export interface LightPresetDefinition {
  /**
   * `torch` for a generic preset, `<preset key>-<light>` for a game system's (`dnd5e-torch`),
   * as condition ids are made. Never changed once shipped: lights record it.
   */
  id: string;
  name: string;
  /** Radius of full light. */
  bright: number;
  /** Radius where the light ends; at least `bright`. */
  dim: number;
  color: string;
  animation: LightAnimation;
  /** Picks the glyph of the light's marker and chip. */
  kind: LightKind;
  /** Size of the flame; unset is the engine's default. */
  sourceRadius?: number;
  /** Brightness multiplier; unset is 1. */
  intensity?: number;
}
