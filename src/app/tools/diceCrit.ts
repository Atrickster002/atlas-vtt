import { parseDefaultRoll } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import type { RolledDie } from './diceFormula';

export type DiceCrit = 'high' | 'low' | null;

/**
 * Classifies a roll for the toast highlight and the result sound. Only the
 * default dice count: the first dice of the default roll's size, as many as it
 * rolls. A roll with fewer of them, such as a d8 under a d20 rule, never crits.
 */
export function getDiceCrit(rolls: readonly RolledDie[], rules: DiceRules): DiceCrit {
  const roll = parseDefaultRoll(rules.defaultRoll);
  if (!roll || rules.crit === 'none') return null;

  const values = rolls
    .filter((die) => !die.negative && die.max === roll.sides)
    .slice(0, roll.count)
    .map((die) => die.value);
  if (values.length < roll.count) return null;

  switch (rules.crit) {
    case 'natural':
      return extremeCrit(values, roll.sides, 1);
    case 'roll-under':
      return extremeCrit(values, 1, roll.sides);
    case 'doubles':
      return values.length >= 2 && values.every((value) => value === values[0]) ? 'high' : null;
  }
}

function extremeCrit(values: readonly number[], best: number, worst: number): DiceCrit {
  if (values.includes(best)) return 'high';
  return values.includes(worst) ? 'low' : null;
}
