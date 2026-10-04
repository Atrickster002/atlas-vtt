/**
 * Dice notation as statblocks write it: "7d10 + 14", "2d6+2", "d20",
 * "1d4 − 1", "2d6 - 1d4". Dice may carry the exploding marks the dice tool
 * reads ("2d6!", "1d6!!", "1d6!i", "2d6!3"); they do not change the average.
 * Anything else (multiplication, words, "d%") is not notation.
 */

export interface DiceTerm {
  sign: 1 | -1;
  count: number;
  sides: number;
}

export interface DiceNotation {
  dice: DiceTerm[];
  /** The constants, added up. */
  modifier: number;
}

/**
 * One signed term: dice with an optional exploding mark, or a constant. Space
 * may stand around a sign, never inside a term ("2 d 6", "2d6 3").
 */
const TERM = /([+-]?)\s*(?:(\d*)d(\d+)(?:!!?(?:i|\d+)?)?|(\d+))\s*/iy;
const MINUS_SIGNS = /[\u2212\u2013]/g;

function addTerm(notation: DiceNotation, match: RegExpExecArray): boolean {
  const [, signText, countText, sidesText, constantText] = match;
  const sign = signText === '-' ? -1 : 1;
  if (constantText !== undefined) {
    const constant = Number(constantText);
    if (!Number.isSafeInteger(constant)) return false;
    notation.modifier += sign * constant;
    return true;
  }
  const count = countText ? Number(countText) : 1;
  const sides = Number(sidesText);
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(sides) || count < 1 || sides < 2) return false;
  notation.dice.push({ sign, count, sides });
  return true;
}

/** The notation's terms, or null when the text is not dice notation. */
export function parseDiceNotation(text: string): DiceNotation | null {
  const compact = text.replace(MINUS_SIGNS, '-').trim();
  if (compact === '') return null;
  const notation: DiceNotation = { dice: [], modifier: 0 };
  let position = 0;
  while (position < compact.length) {
    TERM.lastIndex = position;
    const match = TERM.exec(compact);
    if (!match) return null;
    const signed = match[1] !== '';
    if (position > 0 && !signed) return null;
    if (!addTerm(notation, match)) return null;
    position = TERM.lastIndex;
  }
  return notation;
}

/** Whether the text is notation that rolls at least one die. */
export function isDiceNotation(text: string): boolean {
  const notation = parseDiceNotation(text);
  return notation !== null && notation.dice.length > 0;
}

/**
 * The average of a roll, rounded down as statblocks print it ("7d10 + 14" is
 * 52); null when the text is not notation. A constant alone is its own average.
 */
export function diceAverage(notation: string): number | null {
  const parsed = parseDiceNotation(notation);
  if (!parsed) return null;
  const dice = parsed.dice.reduce((sum, term) => sum + term.sign * term.count * (term.sides + 1) / 2, 0);
  const average = Math.floor(dice + parsed.modifier);
  return average === 0 ? 0 : average;
}
