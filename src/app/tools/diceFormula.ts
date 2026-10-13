/**
 * Parses and rolls dice formulas such as `2d6+3`, `d20+2d6` or `2d6-1d4`.
 * Every term carries its own sign, so the `+2` of `+2d6` is a dice count and
 * never a modifier, and subtracted dice subtract.
 *
 * A dice term may explode (`diceExplosion.ts`): by its own notation, written
 * as Obsidian's Dice Roller writes it since statblocks use that (`2d6!` once,
 * `2d6!3` up to three times, `2d6!i` again and again; `!!` reads the same), or
 * by the collection's rule.
 */

import { parseRollGroups } from '../gameSystems/diceSets';
import type { DiceRules, ExplodeRule } from '../types/diceRulesTypes';
import type { DiceSetDie, RollingDice } from '../types/diceSetTypes';
import { MAX_EXPLOSIONS, rollExplosions, rollFace, type Explosion } from './diceExplosion';
import { keptDice, sharedUnitsDie } from './diceKeep';
import type { ParsedFormula } from './parseFormula';

export interface RolledDie {
  /** e.g. `d20`. */
  die: string;
  value: number;
  max: number;
  /** The die subtracts: it belongs to a subtracted term, e.g. the d4 of `2d6-1d4`, or to an explosion downwards. */
  negative?: true;
  /** The die was rolled because the die before it exploded. */
  exploded?: true;
  /** The name a dice set gives the die ("Sun"); a die rolled for it in an explosion carries it too. */
  name?: string;
  /** `#rrggbb`: the colour a dice set gives the die. */
  colour?: string;
  /** Not kept (`2d20kh1`, advantage's extra die): shown, never counted. */
  dropped?: true;
  /** Rolled because of advantage or disadvantage: a die of the rule's own, added or subtracted. */
  advantage?: true;
  /** A d100 that rolled only its tens and shares the units of the d100 before it (a bonus or penalty die). */
  sharedUnits?: true;
}

/** What a dice set gives the dice of one term: a name and a colour. */
export type DieLook = Pick<DiceSetDie, 'name' | 'colour'>;

export interface RolledFormula {
  rolls: RolledDie[];
  modifiers: number;
  total: number;
}

/** How the collection's rule explodes a die it applies to. */
function ruledExplosion({ repeats, highFaces, lowFaces }: ExplodeRule): Explosion {
  return { highFaces, lowFaces, limit: repeats ? MAX_EXPLOSIONS : 1 };
}

/** A die's name and colour, as the set gives them; nothing for a term no set named. */
function dressed(die: RolledDie, look: DieLook | undefined): RolledDie {
  if (!look) return die;
  return { ...die, ...(look.name && { name: look.name }), ...(look.colour && { colour: look.colour }) };
}

/**
 * Rolls an already validated formula and adds up the result; dropped dice do not count. `rules` are the
 * dice set's (or the collection's dice rules): its exploding rule, and its dice,
 * which say which dice a default-dice rule means: for each group the first
 * added dice of its size, as many as it rolls (as for criticals). `looks` give
 * the dice of the formula's dice terms, by their order, a name and colour.
 */
export function rollFormula(
  formula: ParsedFormula,
  random: () => number = Math.random,
  rules?: Pick<DiceRules, 'defaultRoll' | 'explode'> | Pick<RollingDice, 'dice' | 'explode'>,
  looks: readonly (DieLook | undefined)[] = [],
): RolledFormula {
  const rolls: RolledDie[] = [];
  let modifiers = 0;
  const explode = rules?.explode;
  const groups = !rules || explode?.dice !== 'default' ? [] : 'dice' in rules ? rules.dice : parseRollGroups(rules.defaultRoll) ?? [];
  const defaultLeft = groups.map((group) => ({ sides: group.sides, left: group.count }));
  let diceTerm = 0;

  for (const term of formula.terms) {
    if (term.kind === 'constant') {
      modifiers += term.value;
      continue;
    }
    const look = looks[diceTerm++];
    const { faces, negative } = term;
    const noted = term.explosions === undefined ? null : { highFaces: 1, lowFaces: 0, limit: term.explosions };
    const termDice: RolledDie[] = [];
    for (let i = 0; i < term.count; i++) {
      const first = termDice[0];
      if (term.sharedUnits && faces === 100 && first && i === term.count - 1) {
        termDice.push(sharedUnitsDie(first, random));
        continue;
      }
      const die = dressed({
        die: `d${faces}`,
        value: rollFace(faces, random),
        max: faces,
        ...(negative && { negative: true as const }),
        ...(term.advantage && { advantage: true as const }),
      }, look);
      termDice.push(die);

      const group = negative ? undefined : defaultLeft.find((entry) => entry.sides === faces && entry.left > 0);
      if (group) group.left -= 1;
      const ruled = explode && (explode.dice === 'all' || group) ? ruledExplosion(explode) : null;
      const explosion = noted ?? ruled;
      if (explosion) termDice.push(...rollExplosions(die, explosion, random).map((extra) => dressed(extra, look)));
    }
    rolls.push(...(term.keep ? keptDice(termDice, term.keep, negative) : termDice));
  }

  const dice = rolls.reduce((sum, die) => (die.dropped ? sum : sum + (die.negative ? -die.value : die.value)), 0);
  return { rolls, modifiers, total: dice + modifiers };
}
