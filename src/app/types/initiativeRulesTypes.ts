/**
 * How a collection runs a fight in the initiative tracker.
 *
 * - `turn-order`: every combatant has a number, rolled or typed, and they act from the highest down (D&D, Pathfinder).
 * - `sides`: the players and their opponents act as two blocks, in any order within one; nothing is rolled (Cairn).
 */
export type InitiativeMode = 'turn-order' | 'sides';

export type InitiativeSide = 'players' | 'opponents';

/** A statblock field that gives an initiative modifier. */
export interface InitiativeModifierSource {
  /** Dotted path, as a resource names its field (`initiative`, `stats.1`). */
  field: string;
  /** The field holds an ability score, whose modifier is the d20 rule's `floor((score - 10) / 2)`. */
  abilityScore?: true;
}

export interface InitiativeRules {
  mode: InitiativeMode;
  /** Turn order: the dice a combatant rolls, one group `NdS` such as `1d20`. */
  roll: string;
  /**
   * Turn order: where a combatant's statblock holds the number added to its roll. Unset, or where
   * the statblock lacks that field, the field its template means as initiative counts.
   */
  modifier?: InitiativeModifierSource;
  /** Read last, where neither the modifier's field nor the template's initiative gives a number (5e: DEX). */
  modifierFallback?: InitiativeModifierSource;
  /** Sides: the side that acts first in every round. */
  firstSide: InitiativeSide;
}
