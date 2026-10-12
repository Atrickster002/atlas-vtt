import type { SharedDie, SharedRoll } from '../protocol/index.ts';
import type { ReactElement } from 'react';
import { dieLabel } from '../../tools/diceLabels';
import { classes } from './classes.ts';

/** One die as the list shows it: its text, and what sets it apart (`atlas-online-log__die--<modifier>`). */
export interface DieView {
  readonly text: string;
  readonly modifiers: readonly string[];
}

/** How one die of a roll is shown: `d20: 20` on the high side, `d20: 1` on the low. */
export function dieView(rolls: readonly SharedDie[], index: number): DieView {
  const die = rolls[index]!;
  const modifiers: string[] = [];
  if (die.value === die.max) modifiers.push('max');
  if (die.value === 1) modifiers.push('min');
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
