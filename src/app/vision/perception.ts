import { perceivedLevel } from '../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../gameSystems/senses/generic';
import type { TokenEntity } from '../types';
import type { ConditionDefinition, ConditionEffect } from '../types/collectionSettingsTypes';
import type { LightLevel } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import { computeTokenPixelSize } from '../pixi/token-renderer/tokenSizing';
import { lightLevelAt } from './lightLevels';
import type { AmbientLight, LightReach, Sight, SightRegion } from './sight';
import { tokenEffects } from './sightRules';
import { pointInPolygon } from './visibility';
import { coneContains } from './visionCone';

/**
 * How the vision tokens perceive something: `seen` by a precise sense, `sensed` only by
 * imprecise ones (its place is known, it is not seen), or not at all.
 */
export type Perception = 'seen' | 'sensed' | 'unseen';

/** What the conditions of a token do to how it is perceived. */
export interface PerceivedTarget {
  /** Only senses that see invisible things perceive it. */
  invisible?: boolean;
  /** Senses that ignore what is in the air do not perceive it. */
  airborne?: boolean;
  /** No sense perceives it. */
  undetected?: boolean;
}

/** The target a token with these condition effects is. */
export function targetOf(effects: ReadonlySet<ConditionEffect>): PerceivedTarget {
  return { invisible: effects.has('invisible'), airborne: effects.has('airborne'), undetected: effects.has('undetected') };
}

/** Whether `point` lies where the region's sense reaches. */
export function regionContains(region: SightRegion, point: Point): boolean {
  if (region.polygon) return pointInPolygon(point, region.polygon);
  if (Math.hypot(point.x - region.origin.x, point.y - region.origin.y) > region.radius) return false;
  return !region.cone || coneContains(region.cone, region.origin, point);
}

/**
 * How `sight` perceives something at `point`, where the light is at `level`: each region asks
 * its sense whether it perceives at that level, and the target's conditions rule senses out.
 * Without vision tokens (`sight.all`) normal sight reaches everywhere.
 */
export function perceive(point: Point, sight: Sight, level: LightLevel, target: PerceivedTarget = {}): Perception {
  if (target.undetected) return 'unseen';
  if (sight.all) return !target.invisible && perceivedLevel(NORMAL_SIGHT, level) !== null ? 'seen' : 'unseen';
  let sensed = false;
  for (const region of sight.regions) {
    const { sense } = region;
    if (target.invisible && !region.seesInvisible) continue;
    if (target.airborne && sense.ignores === 'airborne') continue;
    if (perceivedLevel(sense, level) === null || !regionContains(region, point)) continue;
    if (sense.precise) return 'seen';
    sensed = true;
  }
  return sensed ? 'sensed' : 'unseen';
}

/** The footprint of a token that is seen where the map around it is not, in world pixels. */
export interface SeenSpot {
  x: number;
  y: number;
  radius: number;
}

/**
 * The tokens a precise sense that shows no map sees (echolocation), where no sense shows the
 * map: the picture is dark there, so each is shown within its own footprint. Tokens with
 * vision are not among them; `tokens` is the record their places are read from.
 */
export function seenSpots(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  conditions: readonly ConditionDefinition[],
  cellSize: number,
): SeenSpot[] {
  if (sight.all || !sight.regions.some(({ sense }) => sense.precise && sense.reveals === 'creatures')) return [];
  const withMap: Sight = { all: false, regions: sight.regions.filter(({ sense }) => sense.reveals === 'all') };
  const spots: SeenSpot[] = [];
  for (const token of Object.values(tokens)) {
    if (token.vision?.enabled) continue;
    const at = { x: token.x, y: token.y };
    const level = lightLevelAt(at, ambient, lights);
    const target = targetOf(tokenEffects(token, conditions));
    if (perceive(at, sight, level, target) !== 'seen' || perceive(at, withMap, level, target) === 'seen') continue;
    spots.push({ ...at, radius: computeTokenPixelSize(cellSize, token.size || 1) / 2 });
  }
  return spots;
}
