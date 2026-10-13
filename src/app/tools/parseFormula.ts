/** Complete, bounded dice grammar. */
import { MAX_EXPLOSIONS } from './diceExplosion';

export type FormulaErrorCode = 'syntax' | 'length' | 'terms' | 'dice' | 'faces' | 'keep';
export interface FormulaError { readonly ok: false; readonly code: FormulaErrorCode }

/** Which dice of a term count: its `count` highest, or its `count` lowest. */
export interface KeepDice {
  readonly count: number;
  readonly highest: boolean;
}

export type FormulaTerm =
  | { readonly kind: 'constant'; readonly value: number }
  | {
    readonly kind: 'dice';
    readonly count: number;
    readonly faces: number;
    readonly negative: boolean;
    readonly explosions?: number;
    /** `kh` / `kl`: only these dice count, the others are dropped. */
    readonly keep?: KeepDice;
    /**
     * The term's last die rolls only its tens and shares the units of its
     * first: Call of Cthulhu's bonus and penalty die. Never written; advantage sets it.
     */
    readonly sharedUnits?: true;
    /** The die advantage or disadvantage added. Never written; advantage sets it. */
    readonly advantage?: true;
  };

export type DiceTerm = Extract<FormulaTerm, { kind: 'dice' }>;

export interface ParsedFormula {
  readonly ok: true;
  readonly terms: readonly FormulaTerm[];
}

export const FORMULA_LIMITS = { characters: 64, terms: 10, dice: 100, faces: 1000 } as const;

// Sticky matching requires every character to belong to the grammar. In particular,
// whitespace is SP/HTAB only, and every term after the first needs a sign. Keep notation
// is Obsidian Dice Roller's: `2d20kh1`, `4d6kl3`, `kh` alone keeps one.
const TERM = /([+-]?)[ \t]*(?:(\d{0,3})[dD](\d{1,4})(!{1,2}(i|\d{1,2})?)?(?:[kK]([hHlL])(\d{1,3})?)?|(\d{1,4}))[ \t]*/y;

/**
 * Whether parsed terms stay within the limits, or the first limit they break.
 * Terms advantage changed (a die or a term more) are checked again with it
 * before any randomness.
 */
export function formulaWithinLimits(terms: readonly FormulaTerm[]): FormulaError | null {
  if (terms.length > FORMULA_LIMITS.terms) return { ok: false, code: 'terms' };
  const dice = terms.filter((term): term is DiceTerm => term.kind === 'dice');
  if (dice.some((term) => term.faces < 2 || term.faces > FORMULA_LIMITS.faces)) return { ok: false, code: 'faces' };
  if (dice.reduce((sum, term) => sum + term.count, 0) > FORMULA_LIMITS.dice) return { ok: false, code: 'dice' };
  if (dice.some((term) => term.keep && (term.keep.count < 1 || term.keep.count > term.count))) return { ok: false, code: 'keep' };
  return null;
}

/** Validates the whole expression before the caller can consume any randomness. */
export function parseFormula(formula: string): ParsedFormula | FormulaError {
  if (formula.length > FORMULA_LIMITS.characters) return { ok: false, code: 'length' };
  const terms: FormulaTerm[] = [];
  let cursor = /^[ \t]*/.exec(formula)?.[0].length ?? 0;
  while (cursor < formula.length) {
    TERM.lastIndex = cursor;
    const match = TERM.exec(formula);
    if (!match || (terms.length > 0 && !match[1])) return { ok: false, code: 'syntax' };
    cursor = TERM.lastIndex;
    const [, sign, count, sides, explosion, times, keepSide, keepCount, constant] = match;
    if (constant !== undefined) {
      terms.push({ kind: 'constant', value: (sign === '-' ? -1 : 1) * Number(constant) });
    } else {
      terms.push({ kind: 'dice', count: Number(count || '1'), faces: Number(sides), negative: sign === '-',
        ...(explosion !== undefined && { explosions: times === 'i' ? MAX_EXPLOSIONS : Number(times ?? '1') }),
        ...(keepSide !== undefined && { keep: { count: Number(keepCount ?? '1'), highest: keepSide.toLowerCase() === 'h' } }),
      });
    }
    if (terms.length > FORMULA_LIMITS.terms) return { ok: false, code: 'terms' };
  }
  if (terms.length === 0) return { ok: false, code: 'syntax' };
  return formulaWithinLimits(terms) ?? { ok: true, terms };
}
