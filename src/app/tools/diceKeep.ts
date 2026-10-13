/**
 * Keeping the best or worst dice of a term (`4d6kh3`, advantage's one more
 * die): the dice not kept are dropped. A die and the dice rolled because it
 * exploded count as one, by what they add up to, and are kept or dropped
 * together.
 */

import type { RolledDie } from './diceFormula';
import { rollFace } from './diceExplosion';
import type { KeepDice } from './parseFormula';

/** The chains of `dice`: each die with the dice its explosion rolled after it. */
function chainsOf(dice: readonly RolledDie[]): RolledDie[][] {
  const chains: RolledDie[][] = [];
  for (const die of dice) {
    const last = chains.at(-1);
    if (die.exploded && last) last.push(die);
    else chains.push([die]);
  }
  return chains;
}

/** What a chain adds to its term: a die that runs against the term's sign takes away. */
function chainValue(chain: readonly RolledDie[], negative: boolean): number {
  return chain.reduce((sum, die) => sum + ((die.negative === true) === negative ? die.value : -die.value), 0);
}

/**
 * The dice of one term with those not kept marked `dropped`. Of equal chains
 * the earlier is kept.
 */
export function keptDice(dice: readonly RolledDie[], keep: KeepDice, negative: boolean): RolledDie[] {
  const chains = chainsOf(dice);
  const order = chains
    .map((chain, index) => ({ index, value: chainValue(chain, negative) }))
    .sort((a, b) => (keep.highest ? b.value - a.value : a.value - b.value) || a.index - b.index);
  const kept = new Set(order.slice(0, keep.count).map(({ index }) => index));
  return chains.flatMap((chain, index) => (kept.has(index) ? chain : chain.map((die): RolledDie => ({ ...die, dropped: true }))));
}

/**
 * A d100 that rolls only its tens and takes the units of `first`, as Call of
 * Cthulhu's bonus and penalty die do: tens 00 with units 0 is 100.
 */
export function sharedUnitsDie(first: RolledDie, random: () => number): RolledDie {
  const units = first.value % 10;
  const tens = (rollFace(10, random) - 1) * 10;
  return { ...first, value: tens + units || 100, sharedUnits: true };
}
