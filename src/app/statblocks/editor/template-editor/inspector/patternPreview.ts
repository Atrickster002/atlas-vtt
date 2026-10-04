import { isExpressionError } from '../../../expressions/errors';
import { renderPattern } from '../../../expressions/pattern';
import { parsePatternCached } from '../../../expressions/patternParse';
import { sampleRecord } from '../../../model/sampleValues';
import type { StatblockTemplate } from '../../../model/templateTypes';
import { fieldLabels, readerFor } from '../../../values/fieldValues';

export interface PatternPreview {
  /** What the pattern writes with the template's sample values. */
  text: string;
  /** Why it can't be read, or why a value gave nothing, in plain words ("Speed isn't a number."). */
  problem: string | null;
}

/**
 * What a pattern shows with the sample values the canvas previews with (§5.6,
 * §7.9), and the first thing wrong with it; null for an empty pattern.
 */
export function patternPreview(pattern: string, template: StatblockTemplate): PatternPreview | null {
  if (!pattern.trim()) return null;
  const ast = parsePatternCached(pattern);
  if (isExpressionError(ast)) return { text: '', problem: ast.message };
  const labelOf = fieldLabels(template.fields);
  const reader = readerFor(sampleRecord(template), template.fields);
  const shown = renderPattern(ast, reader, { lookups: template.lookups, labelOf });
  return { text: shown.text, problem: shown.problems[0]?.message ?? null };
}
