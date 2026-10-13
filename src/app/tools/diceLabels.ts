/** How the dice of a roll are written out, wherever a roll is listed. */

import { explodes } from './diceExplosion';
import type { RolledDie } from './diceFormula';
import type { RolledWithSet } from '../types/diceSetTypes';

type ListedDie = Pick<RolledDie, 'value' | 'negative' | 'exploded' | 'dropped'>;

/** The dice of a roll that count: those it kept. A dropped die's explosion is dropped with it. */
export function keptRolls<T extends Pick<RolledDie, 'dropped'>>(rolls: readonly T[]): T[] {
  return rolls.filter((roll) => !roll.dropped);
}

/** Whether a roll dropped any die (`2d20kh1`, advantage). */
export const droppedAny = (rolls: readonly Pick<RolledDie, 'dropped'>[]): boolean => rolls.some((roll) => roll.dropped);

/** A die's number; one that exploded is marked as in the notation: `6!`. */
function dieValue(rolls: readonly ListedDie[], index: number): string {
  return `${rolls[index]!.value}${explodes(rolls, index) ? '!' : ''}`;
}

/** The kept dice of a roll as a sum: `6! + 4 + 3`, or `1! − 7` where a die subtracts. */
export function diceSum(all: readonly ListedDie[]): string {
  const rolls = keptRolls(all);
  return rolls
    .map((roll, i) => {
      const value = dieValue(rolls, i);
      if (i === 0) return roll.negative ? `−${value}` : value;
      return roll.negative ? ` − ${value}` : ` + ${value}`;
    })
    .join('');
}

/**
 * One die for a list of the dice rolled: `d6: 6!`, `−d10: 7` for a die an explosion
 * or disadvantage subtracts, and `Sun: 9` for a die a dice set named.
 */
export function dieLabel(rolls: readonly RolledDie[], index: number): string {
  const roll = rolls[index]!;
  return `${roll.negative && (roll.exploded || roll.advantage) ? '−' : ''}${roll.name ?? roll.die}: ${dieValue(rolls, index)}`;
}

type NamedDie = Pick<RolledDie, 'value' | 'negative' | 'exploded' | 'name' | 'dropped'>;

/** ` + 3` or ` − 3`; nothing without a modifier. */
export function modifierText(modifier: number): string {
  if (modifier === 0) return '';
  return modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
}

/** A space a line never breaks at: a die's name stays with its number, a bonus with the last die. */
const KEEP = '\u00a0';

/**
 * The kept dice of a roll by the names a dice set gave them, with the modifier:
 * `Sun 9 · Moon 4 + 3`. A die rolled for an explosion is added to the die it
 * was rolled for (`Sun 12! + 5 · Moon 4`). A line wraps only between dice.
 * Null where no die has a name: the plain sum says it then.
 */
export function namedDiceLine(all: readonly NamedDie[], modifiers: number): string | null {
  const rolls = keptRolls(all);
  if (!rolls.some((roll) => roll.name)) return null;
  const chunks: string[] = [];
  rolls.forEach((roll, i) => {
    const value = dieValue(rolls, i);
    if (roll.exploded && chunks.length > 0) {
      chunks[chunks.length - 1] += `${KEEP}${roll.negative ? '−' : '+'}${KEEP}${value}`;
      return;
    }
    const signed = roll.negative ? `−${value}` : value;
    chunks.push(roll.name ? `${roll.name}${KEEP}${signed}` : signed);
  });
  return `${chunks.join(' · ')}${modifierText(modifiers).replace(/ /g, KEEP)}`;
}

/** What a roll rolled: its formula, after the dice set where that was not the collection's (`Power roll · 2d10+3`). */
export function rollFormulaText(result: { formula: string; diceSet?: RolledWithSet | undefined }): string {
  return result.diceSet ? `${result.diceSet.name} · ${result.formula}` : result.formula;
}

/**
 * A roll in one line for a card or the log: its dice by name where a set named them
 * (`Sun 9 · Moon 4 + 3`), else its formula, after the set where that was not the collection's.
 */
export function rollLine(result: { formula: string; rolls: readonly NamedDie[]; modifiers: number; diceSet?: RolledWithSet | undefined }): string {
  const named = namedDiceLine(result.rolls, result.modifiers);
  if (named === null) return rollFormulaText(result);
  return result.diceSet ? `${result.diceSet.name} · ${named}` : named;
}
