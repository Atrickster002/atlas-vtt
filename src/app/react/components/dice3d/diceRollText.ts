import type { DiceScene } from '../../../dice3d/diceScene';
import { diceSum, keptRolls, modifierText, namedDiceLine } from '../../../tools/diceLabels';
import type { DiceRollResult } from '../../../types/diceTypes';
import { t } from '../../../i18n';

/**
 * What was rolled, e.g. "Scimitar"; a roll without an action is just a roll.
 * Never who rolled it: the creature's portrait beside the label says that.
 */
export function rollLabel(result: DiceRollResult): string {
  return result.source?.abilityName || 'Roll';
}

/** "Advantage" or "Disadvantage", where the roll was made with it. */
export function advantageText(result: Pick<DiceRollResult, 'advantage'>): string | null {
  if (!result.advantage) return null;
  return result.advantage === 'advantage' ? t('dice.advantage') : t('dice.disadvantage');
}

/** The line under the total, after the side of advantage the roll was made with: `Advantage · 17 + 5`. */
export function rollBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const side = advantageText(result);
  const dice = diceBreakdown(result, scene);
  if (side === null) return dice;
  return dice === null ? side : `${side} · ${dice}`;
}

/**
 * The kept dice under the total, with the names a dice set gave them (`Sun 9 · Moon 4 + 3`);
 * the dropped dice fade on the stage. A die stood in for another (a d2 on a d6)
 * explains itself, since a 6 on the stage next to a total of 2 looks like an
 * error. More than six dice are summed rather than listed: the chain would
 * wrap, the panel holds one line, and the pips lie on the stage anyway.
 */
function diceBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const suffix = modifierText(result.modifiers);
  const kept = keptRolls(result.rolls);
  const values = kept.map((roll) => roll.value);
  const diceTotal = result.total - result.modifiers;

  if (scene.plan[0]?.role === 'tens') {
    const value = kept[0]?.value ?? 0;
    return `Tens ${Math.floor((value % 100) / 10) * 10}, units ${value % 10}${suffix}`;
  }
  const named = namedDiceLine(result.rolls, result.modifiers);
  if (named !== null && values.length <= 6) return named;
  if (values.length > 6) return `${values.length} dice, ${diceTotal}${suffix}`;
  if (scene.plan.some((die) => die.fold !== undefined)) {
    const faces = scene.faces.filter((_, i) => !scene.plan[i]?.dropped);
    return `${faces.join(' + ')} on the d${scene.plan[0]!.sides} counts ${values.join(' + ')}${suffix}`;
  }
  return values.length > 1 || suffix !== '' ? `${diceSum(result.rolls)}${suffix}` : null;
}

/** Whether a breakdown line will show, known before landing so the panel never grows. */
export function hasBreakdown(result: DiceRollResult, scene: DiceScene): boolean {
  return result.advantage !== undefined
    || scene.plan[0]?.role === 'tens'
    || scene.plan.some((die) => die.fold !== undefined)
    || scene.plan.length > 1
    || result.modifiers !== 0;
}
