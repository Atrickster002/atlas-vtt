/**
 * How a collection rolls dice: the roll a bare bonus is added to, and how
 * critical results are recognised.
 */

/**
 * - `natural`: the highest face of a default die is a critical success, a 1 a failure (d20 systems).
 * - `roll-under`: a 1 is a critical success, the highest face a failure (Call of Cthulhu).
 * - `doubles`: matching default dice are a critical success (Daggerheart's duality dice).
 * - `none`: no critical results (Cairn).
 */
export type CritRule = 'natural' | 'roll-under' | 'doubles' | 'none';

export interface DiceRules {
  /** One dice group, `NdS`, e.g. `1d20` or `2d12`. A bare `+3` rolls `1d20+3`. */
  defaultRoll: string;
  /** Applies to the default dice of a roll only. */
  crit: CritRule;
}
