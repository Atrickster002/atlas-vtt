import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import type { HideableLayer } from '../playerSafeFrame';
import type { SceneFrame } from './engine/types';

/** What the map view needs from scene lighting, on the GPU or in the Canvas fallback. */
export interface SceneLightingView {
  /** Visible means the players' view: flipped by the player-frame capture, held in session view. */
  readonly modeLayer: HideableLayer;
  isEnabled(): boolean;
  /**
   * Runs `render`, a render of `frame` (a thumbnail), with the scene lit for that frame as the GM
   * sees it, whatever camera and view the canvas shows. Lighting that fails here leaves the
   * render unlit.
   */
  renderForFrame<T>(frame: SceneFrame, render: () => T): T;
  currentSight(): Sight;
  lightReaches(): LightReach[];
  /** The ambient light the CPU checks tokens against. */
  ambientLight(): AmbientLight;
  refreshBounds(): void;
  resetExplored(): void;
  /** The view's map is about to unload: finish pending saves for it. */
  beforeMapUnload(): void;
  destroy(): void;
}
