/**
 * Parses and rolls dice formulas such as `2d6+3`, `d20+2d6` or `2d6-1d4`.
 * Every term carries its own sign, so the `+2` of `+2d6` is a dice count and
 * never a modifier, and subtracted dice subtract.
 */

export interface RolledDie {
  /** e.g. `d20`. */
  die: string;
  value: number;
  max: number;
  /** The die belongs to a subtracted term, e.g. the d4 of `2d6-1d4`. */
  negative?: true;
}

export interface RolledFormula {
  rolls: RolledDie[];
  modifiers: number;
  total: number;
}

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)|(\d+))/gi;

/** Whether the formula names any dice; a bare `+3` does not. */
export function hasDiceTerm(formula: string): boolean {
  return /\d*d\d+/i.test(formula);
}

/** Rolls every dice term of the formula and adds up the result. Dice with fewer than two sides are skipped. */
export function rollFormula(formula: string, random: () => number = Math.random): RolledFormula {
  const rolls: RolledDie[] = [];
  let modifiers = 0;
  let total = 0;

  for (const [, sign, count, sides, constant] of formula.matchAll(TERM)) {
    const factor = sign === '-' ? -1 : 1;
    if (constant !== undefined) {
      modifiers += factor * Number(constant);
      continue;
    }
    const faces = Number(sides);
    if (faces < 2) continue;
    for (let i = 0; i < Number(count || '1'); i++) {
      const value = Math.floor(random() * faces) + 1;
      rolls.push({ die: `d${faces}`, value, max: faces, ...(factor < 0 && { negative: true as const }) });
      total += factor * value;
    }
  }

  return { rolls, modifiers, total: total + modifiers };
}
