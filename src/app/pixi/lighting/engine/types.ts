import type { Texture } from 'pixi.js';
import type { LightAnimation, SceneLighting } from '../../../types/lightingTypes';
import type { WallSegment } from '../../../types/wallTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import type { MapBounds } from '../../../vision/visibility';

/** A light in world pixels with its steady settings; colour is linear and already tinted. */
export interface EngineLight {
  key: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  /** Radius of the flame before placement clamps it. */
  flame: number;
  color: readonly [number, number, number];
  intensity: number;
  animation: LightAnimation;
  /** A source of magical darkness: it swallows light within `dim` instead of giving any. */
  darkness?: boolean;
  /** Which of a light and a darkness that meet wins (`LightEmission.priority`); unset is 0. */
  priority?: number;
}

/**
 * Everything the engine lights, in world pixels, with the scene options the composite draws:
 * ambient light, and how the players' view shows what no token sees now (unset options keep
 * their defaults, which draw exactly as before the options existed).
 */
export interface EngineScene extends Pick<SceneLighting, 'ambientColor' | 'exploredMemory' | 'exploredColor' | 'unexploredColor' | 'litThreshold' | 'brightThreshold'> {
  bounds: MapBounds;
  /** The map image; bounce reads its colours (mid grey without one). */
  albedo: Texture | null;
  /** Sealed walls: the drawn walls followed by the bridges that close their joints (`sealedWalls`). */
  walls: readonly WallSegment[];
  lights: readonly EngineLight[];
  sight: Sight;
  /** Tokens seen where no sense shows the map: each is shown within its footprint (`seenSpots`). */
  spots?: readonly SeenSpot[];
  /** Footprint radius of a vision token, for the soft edges of its sight. */
  sightRadius: number;
  ambient: number;
}

/**
 * A render of the viewport outside the stage's, without its camera (`generateTexture`): world
 * point (x, y) is its first pixel, and `resolution` is its pixels per world pixel.
 */
export interface SceneFrame {
  x: number;
  y: number;
  resolution: number;
}
