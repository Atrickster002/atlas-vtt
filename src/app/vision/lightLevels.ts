import { brightThresholdOf, litThresholdOf } from '../lighting/sceneLightingOptions';
import type { LightLevel } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import type { AmbientLight, LightReach } from './sight';
import { pointInPolygon } from './visibility';

/**
 * The light level the scene's ambient light alone gives every point: dark below the lit
 * threshold, bright from the bright threshold, dim between them (day is bright, dusk dim, night dark).
 */
export function ambientLevel(light: AmbientLight): LightLevel {
  if (light.ambient < litThresholdOf(light)) return 'dark';
  return light.ambient >= brightThresholdOf(light) ? 'bright' : 'dim';
}

/** The light level the lights give `point`: bright within a bright radius, dim within a dim one, where no wall is between. */
function levelFromLights(point: Point, lights: readonly LightReach[]): LightLevel {
  let level: LightLevel = 'dark';
  for (const light of lights) {
    const distance = Math.hypot(point.x - light.origin.x, point.y - light.origin.y);
    if (distance > light.dim || !pointInPolygon(point, light.polygon)) continue;
    if (distance <= light.bright) return 'bright';
    level = 'dim';
  }
  return level;
}

/**
 * How well `point` is lit, the brightest of the ambient light and every light that reaches it.
 * The one function sight rules read. It never returns `magical-dark`: darkness sources do not
 * exist yet.
 */
export function lightLevelAt(point: Point, ambient: AmbientLight, lights: readonly LightReach[]): LightLevel {
  const fromAmbient = ambientLevel(ambient);
  if (fromAmbient === 'bright') return 'bright';
  const fromLights = levelFromLights(point, lights);
  return fromLights === 'dark' ? fromAmbient : fromLights;
}
