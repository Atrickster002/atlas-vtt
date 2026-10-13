/**
 * Advantage and disadvantage: what a dice set's rule for a side does to a
 * roll (`AdvantageRule`). It changes only a roll of the set's own dice, as
 * criticals look only at them: a damage roll of 2d8 under a d20 set rolls as
 * it is. Asked for both at once, they cancel.
 */

import type { AdvantageRule, AdvantageSide, RollingDice } from '../types/diceSetTypes';
import { completeFormula } from './completeFormula';
import type { DieLook } from './diceFormula';
import { formulaWithinLimits, type DiceTerm, type FormulaError, type FormulaTerm, type ParsedFormula } from './parseFormula';

export const ADVANTAGE_SIDES: readonly AdvantageSide[] = ['advantage', 'disadvantage'];

/** The side a roll is made with when both may be asked for (Shift and Alt at once): they cancel. */
export function advantageSide(advantage: boolean, disadvantage: boolean): AdvantageSide | null {
  if (advantage === disadvantage) return null;
  return advantage ? 'advantage' : 'disadvantage';
}

/** The sides `rules` say anything for. */
export function ruledSides(rules: RollingDice): AdvantageSide[] {
  return ADVANTAGE_SIDES.filter((side) => rules[side] !== undefined);
}

const isSetTerm = (term: FormulaTerm): term is DiceTerm => term.kind === 'dice' && !term.negative && !term.keep && !term.advantage;

/**
 * The index of the term that rolls the set's first die, where the terms hold
 * all of the set's dice (as criticals find them); null where they do not.
 * Terms that keep dice of their own (`2d20kh1`) are none of them.
 */
export function setDiceTerm(terms: readonly FormulaTerm[], rules: RollingDice): number | null {
  const left = new Map<number, number>();
  for (const term of terms) if (isSetTerm(term)) left.set(term.faces, (left.get(term.faces) ?? 0) + term.count);
  for (const group of rules.dice) {
    const held = left.get(group.sides) ?? 0;
    if (held < group.count) return null;
    left.set(group.sides, held - group.count);
  }
  const first = rules.dice[0];
  const index = terms.findIndex((term) => isSetTerm(term) && term.faces === first?.sides);
  return index < 0 ? null : index;
}

/** The sides that change a roll of `formula` by `rules`: those the set has a rule for, where the roll holds the set's dice. */
export function advantageSidesFor(formula: string, rules: RollingDice): AdvantageSide[] {
  const complete = completeFormula(formula, rules);
  return complete.ok && setDiceTerm(complete.parsed.terms, rules) !== null ? ruledSides(rules) : [];
}

/** What advantage made of a roll: the terms to roll and the dice's looks, and the rules their explosions follow. */
export interface AdvantagedFormula {
  formula: ParsedFormula;
  looks: (DieLook | undefined)[];
  /** The set's rules with its first group one die larger where advantage rolls one more of it, so that die explodes too. */
  explodeRules: RollingDice;
}

/** Whether a side keeps the highest dice: advantage does, unless the set rolls under. */
const keepsHighest = (side: AdvantageSide, rules: RollingDice): boolean => (side === 'advantage') !== (rules.crit === 'roll-under');

function withKeep(term: DiceTerm, rule: Extract<AdvantageRule, { kind: 'keep' }>, side: AdvantageSide, rules: RollingDice): DiceTerm {
  const shares = rule.tensOnly === true && term.faces === 100 && term.count === 1;
  return { ...term, count: term.count + 1, keep: { count: term.count, highest: keepsHighest(side, rules) }, ...(shares && { sharedUnits: true as const }) };
}

/**
 * The roll `formula` becomes with `side`: null where the set has no rule for
 * the side or the roll holds none of the set's dice (it rolls as it is), the
 * limit it would break where advantage takes it past one.
 */
export function withAdvantage(
  formula: ParsedFormula, looks: readonly (DieLook | undefined)[], rules: RollingDice, side: AdvantageSide,
): AdvantagedFormula | FormulaError | null {
  const rule = rules[side];
  const at = rule ? setDiceTerm(formula.terms, rules) : null;
  if (!rule || at === null) return null;
  const terms = [...formula.terms];
  const diceTerms = terms.filter((term) => term.kind === 'dice').length;
  const shownLooks = Array.from({ length: diceTerms }, (_, i) => looks[i]);
  let explodeRules = rules;
  if (rule.kind === 'keep') {
    terms[at] = withKeep(terms[at] as DiceTerm, rule, side, rules);
    const [first, ...rest] = rules.dice;
    if (first) explodeRules = { ...rules, dice: [{ ...first, count: first.count + 1 }, ...rest] };
  } else if (rule.kind === 'die') {
    terms.push({ kind: 'dice', count: 1, faces: rule.sides, negative: side === 'disadvantage', advantage: true });
    shownLooks.push({ ...(rule.name && { name: rule.name }), ...(rule.colour && { colour: rule.colour }) });
  } else {
    terms.push({ kind: 'constant', value: side === 'advantage' ? rule.value : -rule.value });
  }
  const broken = formulaWithinLimits(terms);
  return broken ?? { formula: { ok: true, terms }, looks: shownLooks, explodeRules };
}
