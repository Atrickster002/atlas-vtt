import type { MapStretch } from '../grid/mapStretch';

/**
 * How a level's map image lies on the scene's one grid: drawn with `stretch` (as the scene's own
 * image is drawn with `GridState.mapStretch`), then scaled by `scale` and moved by `offset` world
 * pixels, so its printed grid lies on the scene's. Read it only through `levelImagePlacement`.
 */
export interface LevelAlignment {
  offset: { x: number; y: number };
  scale: number;
  stretch: MapStretch;
}

/** A level's height range in game units: what it stands on and where its ceiling is. */
export interface LevelElevation {
  bottom: number;
  top: number;
}

/**
 * One floor of a scene (Foundry's Level): a map image of its own over the scene's shared grid.
 * A scene's levels are ordered bottom first; the first is the one every object without a level
 * stands on, and its background is the scene's `background`.
 */
export interface SceneLevel {
  id: string;
  name: string;
  elevation: LevelElevation;
  /** The level's map image, a vault path; null for a level without one. */
  background: string | null;
  /** A roof or canopy drawn above the tokens. */
  foreground?: string | null;
  /** The levels seen through this one's transparent parts; unset is every level below it. */
  sees?: string[];
  /** Where the level's background lies, in cells from the scene's origin. */
  offset?: { x: number; y: number };
  /**
   * How the level's image is fitted to the scene's grid. In a scene file only: in memory it is the
   * view state's `levelAlignments`, which undo reaches level by level.
   */
  alignment?: LevelAlignment | undefined;
}

/**
 * The levels a wall, light, light zone or sound belongs to: some by id, or all of them, which
 * includes levels added later. Unset is the first level.
 */
export type LevelSet = string[] | 'all';

/** An object that stands on one level: tokens, pins, texts, drawings, fog. Unset is the first level. */
export interface OnOneLevel {
  level?: string | undefined;
}

/** An object that may belong to several levels: walls, lights, light zones, sounds. */
export interface OnLevels {
  levels?: LevelSet | undefined;
}
