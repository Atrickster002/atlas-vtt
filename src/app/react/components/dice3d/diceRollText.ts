import type { DiceScene } from '../../../dice3d/diceScene';
import type { DiceRollResult } from '../../../tools/DiceTool';

/** Who rolled what, e.g. "Goblin · Scimitar"; plain rolls from the tray are just a roll. */
export function rollLabel(result: DiceRollResult): string {
  const source = result.source;
  return [source?.tokenName, source?.abilityName].filter(Boolean).join(' · ') || 'Roll';
}

/** ` + 3` or ` − 3`; nothing without a modifier. */
function modifierSuffix(modifier: number): string {
  if (modifier === 0) return '';
  return modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
}

/**
 * The line under the total. A die stood in for another (a d2 on a d6) explains
 * itself, since a 6 on the stage next to a total of 2 looks like an error. More
 * than six dice are summed rather than listed: the chain would wrap, the panel
 * holds one line, and the pips lie on the stage anyway.
 */
export function rollBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const suffix = modifierSuffix(result.modifiers);
  const values = result.rolls.map((roll) => roll.value);
  const diceSum = result.total - result.modifiers;

  if (scene.plan[0]?.role === 'tens') {
    return `Tens ${(scene.faces[0]! - 1) * 10}, units ${scene.faces[1]! % 10}${suffix}`;
  }
  if (values.length > 6) return `${values.length} dice, ${diceSum}${suffix}`;
  if (scene.plan.some((die) => die.fold !== undefined)) {
    return `${scene.faces.join(' + ')} on the d${scene.plan[0]!.sides} counts ${values.join(' + ')}${suffix}`;
  }
  return values.length > 1 || suffix !== '' ? `${values.join(' + ')}${suffix}` : null;
}

/** Whether a breakdown line will show, known before landing so the panel never grows. */
export function hasBreakdown(result: DiceRollResult, scene: DiceScene): boolean {
  return scene.plan[0]?.role === 'tens'
    || scene.plan.some((die) => die.fold !== undefined)
    || scene.plan.length > 1
    || result.modifiers !== 0;
}
