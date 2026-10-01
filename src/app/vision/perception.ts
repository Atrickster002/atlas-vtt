import { perceivedLevel } from '../gameSystems/senseRules';
import { movedWhileHeld, type HeldTokens } from '../lighting/sightOnDrop';
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

/** Whether some sense of a vision token reaches `point`, whatever the light there. */
export function withinReach(point: Point, sight: Sight): boolean {
  return sight.all || sight.regions.some((region) => regionContains(region, point));
}

/**
 * The region through which something at `point` is perceived best, where the light is at
 * `level`: each region asks its sense whether it perceives at that level, and the target's
 * conditions rule senses out. A precise sense comes before an imprecise one; null when no
 * region perceives it (also without vision tokens, when there are no regions).
 */
export function perceivingRegion(point: Point, sight: Sight, level: LightLevel, target: PerceivedTarget = {}): SightRegion | null {
  if (target.undetected) return null;
  let sensing: SightRegion | null = null;
  for (const region of sight.regions) {
    const { sense } = region;
    if (target.invisible && !region.seesInvisible) continue;
    if (target.airborne && sense.ignores === 'airborne') continue;
    if (perceivedLevel(sense, level) === null || !regionContains(region, point)) continue;
    if (sense.precise) return region;
    sensing ??= region;
  }
  return sensing;
}

/**
 * How `sight` perceives something at `point`, where the light is at `level` (`perceivingRegion`).
 * Without vision tokens (`sight.all`) normal sight reaches everywhere.
 */
export function perceive(point: Point, sight: Sight, level: LightLevel, target: PerceivedTarget = {}): Perception {
  if (target.undetected) return 'unseen';
  if (sight.all) return !target.invisible && perceivedLevel(NORMAL_SIGHT, level) !== null ? 'seen' : 'unseen';
  const region = perceivingRegion(point, sight, level, target);
  if (!region) return 'unseen';
  return region.sense.precise ? 'seen' : 'sensed';
}

/** What perception reads besides sight and light. */
export interface PerceptionOptions {
  /** The conditions of the map's collection, for those that change sight; none reads no condition. */
  conditions?: readonly ConditionDefinition[];
  /** The tokens the pointer holds while sight waits for the drop, with the places they were taken from. */
  held?: HeldTokens;
}

/** The footprint of a token that is shown where the map around it is not, in world pixels. */
export interface SeenSpot {
  x: number;
  y: number;
  radius: number;
}

/**
 * The tokens the players see where no sense shows them the map, so that the picture is dark
 * there: each is shown within its own footprint.
 * - A token with vision: the players always see their party, also one standing in darkness or
 *   blinded. One the pointer has moved beyond the sight that stayed behind is not shown until
 *   the drop (`held`, as in `tokenPerception`).
 * - A token a precise sense that shows no map sees (echolocation).
 *
 * Never a hidden token. `tokens` is the record their places are read from.
 */
export function seenSpots(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  cellSize: number,
  { conditions = [], held = {} }: PerceptionOptions = {},
): SeenSpot[] {
  if (sight.all) return [];
  const withMap: Sight = { all: false, regions: sight.regions.filter(({ sense }) => sense.reveals === 'all') };
  const seesCreatures = sight.regions.some(({ sense }) => sense.precise && sense.reveals === 'creatures');
  const spots: SeenSpot[] = [];
  for (const token of Object.values(tokens)) {
    const party = !!token.vision?.enabled;
    if (token.isHidden || (!party && !seesCreatures)) continue;
    const at = { x: token.x, y: token.y };
    const level = lightLevelAt(at, ambient, lights);
    if (party) {
      if (movedWhileHeld(token, held) && !withinReach(at, sight)) continue;
      if (perceive(at, withMap, level) === 'seen') continue;
    } else {
      const target = targetOf(tokenEffects(token, conditions));
      if (perceive(at, sight, level, target) !== 'seen' || perceive(at, withMap, level, target) === 'seen') continue;
    }
    spots.push({ ...at, radius: computeTokenPixelSize(cellSize, token.size || 1) / 2 });
  }
  return spots;
}
