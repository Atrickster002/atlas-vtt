/**
 * A collection's dice rules: reading them from the settings, checking and
 * comparing them.
 */

import type { CritRule, DiceRules } from '../types/diceRulesTypes';
import type { SystemPreset } from '../types/systemPresetTypes';

/** Dice of a collection without a game system: a d20, natural 20 and natural 1. */
export const DEFAULT_DICE_RULES: Readonly<DiceRules> = { defaultRoll: '1d20', crit: 'natural' };

export const CRIT_RULES: readonly CritRule[] = ['natural', 'roll-under', 'doubles', 'none'];

/** 1 to 99 dice of 2 to 999 sides, e.g. `1d20`, `2d12` or `d100`. */
const DEFAULT_ROLL = /^([1-9]\d?)?d([2-9]|[1-9]\d{1,2})$/i;

/** Count and sides of a default roll such as `2d12`; null when it is not one valid dice group. */
export function parseDefaultRoll(defaultRoll: string): { count: number; sides: number } | null {
  const match = DEFAULT_ROLL.exec(defaultRoll.trim());
  return match ? { count: Number(match[1] ?? '1'), sides: Number(match[2]) } : null;
}

export function isValidDefaultRoll(value: string): boolean {
  return parseDefaultRoll(value) !== null;
}

/**
 * The collection's dice rules: its own, else those of the preset it was set
 * from (collections saved before dice rules existed), else the default.
 */
export function collectionDiceRules(
  settings: { dice?: DiceRules | undefined; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): DiceRules {
  return settings.dice
    ?? presets.find((preset) => preset.id === settings.systemPresetId)?.rules.dice
    ?? { ...DEFAULT_DICE_RULES };
}

export function sameDiceRules(a: DiceRules | undefined, b: DiceRules | undefined): boolean {
  const left = a ?? DEFAULT_DICE_RULES;
  const right = b ?? DEFAULT_DICE_RULES;
  return left.defaultRoll.trim().toLowerCase() === right.defaultRoll.trim().toLowerCase() && left.crit === right.crit;
}
