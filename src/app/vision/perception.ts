import { perceivedLevel } from '../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../gameSystems/senses/generic';
import type { ConditionEffect } from '../types/collectionSettingsTypes';
import type { LightLevel } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import type { Sight, SightRegion } from './sight';
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
