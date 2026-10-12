import type { SharedDie, SharedRoll } from '../protocol/index.ts';
import type { ReactElement } from 'react';
import { dieLabel } from '../../tools/diceLabels';
import { classes } from './classes.ts';

/** One die as the list shows it: its text, and what sets it apart (`atlas-online-log__die--<modifier>`). */
export interface DieView {
  readonly text: string;
  readonly modifiers: readonly string[];
}

/**
 * How one die of a roll is shown: its label, marked on the high or low side, as a success or a
 * failure, or struck through where it counts for nothing (dropped, or rolled again).
 */
export function dieView(rolls: readonly SharedDie[], index: number): DieView {
  const die = rolls[index]!;
  const modifiers: string[] = [];
  if (die.dropped === true) modifiers.push('dropped');
  else if (die.rerolled === true) modifiers.push('rerolled');
  else {
    if (die.value === die.max) modifiers.push('max');
    if (die.value === (die.min ?? 1)) modifiers.push('min');
    if (die.success === true) modifiers.push('success');
    if (die.failure === true) modifiers.push('failure');
  }
  return { text: dieLabel(rolls, index), modifiers };
}

/** The constant a roll adds, as the dice list ends with it: "+3", "−2"; null for none. */
function modifierText(modifiers: number): string | null {
  if (modifiers === 0) return null;
  return modifiers > 0 ? `+${modifiers}` : `−${Math.abs(modifiers)}`;
}

/** The dice of a roll and the constant it adds, each in a chip: the one place a roll's dice are written out. */
export function RollDice({ roll, id }: { readonly roll: SharedRoll; readonly id?: string }): ReactElement {
  const constant = modifierText(roll.modifiers);
  return (
    <div id={id} className="atlas-online-log__roll-dice">
      {roll.rolls.map((_, index) => {
        const { text, modifiers } = dieView(roll.rolls, index);
        return <span key={index} className={classes('atlas-online-log__die', ...modifiers.map((modifier) => `atlas-online-log__die--${modifier}`))}>{text}</span>;
      })}
      {constant !== null && <span className="atlas-online-log__die">{constant}</span>}
    </div>
  );
}

/** The class a roll's crit gives what shows its total. */
export function critClass(roll: SharedRoll, base: string): string | null {
  if (roll.crit === 'high') return `${base}--crit-success`;
  return roll.crit === 'low' ? `${base}--crit-fail` : null;
}
