import { conditionEffect } from '../gameSystems/conditionEffects';
import { GENERIC_SENSES } from '../gameSystems/senses/generic';
import type { TokenEntity } from '../types';
import type { ConditionDefinition, ConditionEffect } from '../types/collectionSettingsTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';

/** What a scene's collection decides about sight. */
export interface SightRules {
  /** The senses tokens of the collection can have (`collectionSenses`). */
  definitions: readonly SenseDefinition[];
  /** Its conditions, for those that change sight. */
  conditions: readonly ConditionDefinition[];
  /**
   * How a token perceives. Unset, that is read from its vision alone (`tokenSenses`, its
   * `range`); set, this is the one place sight gets it from, for tokens that follow a linked
   * statblock (`tokenSensesResolver`).
   */
  visionOf?: (token: TokenEntity) => TokenSight;
}

/** How one token perceives, as sight reads it. */
export interface TokenSight {
  senses: readonly TokenSense[];
  /** How far its normal sight reaches, in game units: unset is unlimited, 0 is no normal sight at all. */
  sightRange?: number;
  /** Not known yet (its statblock is still being read): the token sees and senses nothing until it is. */
  pending?: boolean;
}

/** A scene without a collection: the generic senses, no conditions. */
export const GENERIC_SIGHT_RULES: SightRules = { definitions: GENERIC_SENSES, conditions: [] };

/** What the conditions a token has do to sight. */
export function tokenEffects(token: Pick<TokenEntity, 'conditions'>, conditions: readonly ConditionDefinition[]): ReadonlySet<ConditionEffect> {
  const effects = new Set<ConditionEffect>();
  for (const id of token.conditions ?? []) {
    const condition = conditions.find((candidate) => candidate.id === id);
    const effect = condition && conditionEffect(condition);
    if (effect) effects.add(effect);
  }
  return effects;
}
