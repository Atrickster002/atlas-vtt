/**
 * How the dice of a roll are written out, wherever a roll is listed. Marks
 * follow the number: `6!` exploded, `8✓` a success, `1✗` a failure, `(3)`
 * dropped, and `1→4` a die rolled again and the die that took its place. A
 * Fate die shows `+`, `−` or `0` on its own, and its number in a sum.
 */

import { explodes } from './diceExplosion';
import type { RolledDie } from './diceFormula';

type ListedDie = Pick<RolledDie, 'value' | 'negative' | 'exploded' | 'rerolled' | 'dropped' | 'success' | 'failure' | 'min' | 'label'>;

const isFate = (die: ListedDie): boolean => die.min !== undefined && die.min < 0;

/** A Fate die's face as it is printed on the die. */
function fateFace(value: number): string {
  if (value > 0) return '+';
  return value < 0 ? '−' : '0';
}

/** `text` with the die's marks. */
function marked(rolls: readonly ListedDie[], index: number, text: string): string {
  const die = rolls[index]!;
  const marks = `${explodes(rolls, index) ? '!' : ''}${die.success ? '✓' : ''}${die.failure ? '✗' : ''}`;
  if (die.rerolled) return `${text}${marks}→`;
  return die.dropped ? `(${text}${marks})` : `${text}${marks}`;
}

/** ` [fire]` after the last die of a run of dice labelled `fire`. */
function labelAfter(rolls: readonly ListedDie[], index: number): string {
  const { label } = rolls[index]!;
  return label !== undefined && rolls[index + 1]?.label !== label ? ` [${label}]` : '';
}

/** Whether the die at `index` stands in for a die rolled again, so it follows it without a gap. */
const replaces = (rolls: readonly ListedDie[], index: number): boolean => rolls[index - 1]?.rerolled === true;

/** The dice of a roll as a sum: `6! + 4 + 3`, or `1! − 7` where a die subtracts. */
export function diceSum(rolls: readonly ListedDie[]): string {
  return rolls
    .map((roll, i) => {
      // A Fate die's −1 subtracts its 1.
      const subtracts = (roll.negative === true) !== (isFate(roll) && roll.value < 0);
      const value = marked(rolls, i, String(isFate(roll) ? Math.abs(roll.value) : roll.value)) + labelAfter(rolls, i);
      if (replaces(rolls, i)) return value;
      if (i === 0) return subtracts ? `−${value}` : value;
      return subtracts ? ` − ${value}` : ` + ${value}`;
    })
    .join('');
}

/** The dice of a roll as a list, for a formula that is no plain sum: `8✓, 3, 10!✓`. */
export function diceList(rolls: readonly ListedDie[]): string {
  return rolls
    .map((roll, i) => {
      const value = marked(rolls, i, isFate(roll) ? fateFace(roll.value) : String(roll.value)) + labelAfter(rolls, i);
      return i === 0 || replaces(rolls, i) ? value : `, ${value}`;
    })
    .join('');
}

/**
 * One die for a list of the dice rolled: `d6: 6!`, `dF: +`, `d6[fire]: 4`,
 * and `−d10: 7` for a die an explosion subtracts.
 */
export function dieLabel(rolls: readonly RolledDie[], index: number): string {
  const roll = rolls[index]!;
  const label = roll.label === undefined ? '' : `[${roll.label}]`;
  const value = marked(rolls, index, isFate(roll) ? fateFace(roll.value) : String(roll.value));
  return `${roll.negative && roll.exploded ? '−' : ''}${roll.die}${label}: ${value}`;
}

export type DieState = 'max' | 'min' | 'dropped' | 'rerolled' | 'success' | 'failure';

/**
 * What a die's badge shows besides its number: its highest or lowest face,
 * whether it counted for nothing, and whether it counted as a success or a
 * failure. A die that counted for nothing is never highlighted for its face.
 */
export function dieStates(die: Pick<RolledDie, 'value' | 'max' | 'min' | 'dropped' | 'rerolled' | 'success' | 'failure'>): DieState[] {
  const states: DieState[] = [];
  if (die.dropped) states.push('dropped');
  if (die.rerolled) states.push('rerolled');
  if (!die.dropped && !die.rerolled) {
    if (die.value === die.max) states.push('max');
    else if (die.value === (die.min ?? 1)) states.push('min');
  }
  if (die.success) states.push('success');
  if (die.failure) states.push('failure');
  return states;
}
