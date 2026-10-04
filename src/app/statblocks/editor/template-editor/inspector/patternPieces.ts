/**
 * A pattern (§5.6) as the inspector shows it: runs of text the author types,
 * and each `{…}` value as one chip named in words ("Hit points", "= floor((Dex
 * - 10) / 2) · signed"), so most authors never see the syntax. Pure; the text
 * runs are the pattern's own characters, escapes and optional brackets included.
 */

import { isExpressionError, type LabelResolver } from '../../../expressions/errors';
import { formulaText } from '../../../expressions/formulaText';
import { parsePatternCached } from '../../../expressions/patternParse';
import type { PatternFilter } from '../../../expressions/patternTypes';

export type PatternPiece = { kind: 'text'; text: string } | { kind: 'value'; source: string };

export interface ChipLook {
  label: string;
  /** The value can't be read, or names a field the template does not have. */
  problem: boolean;
}

/** The index of the `}` that closes a value opened before `from`, or -1 where none does before another `{`. */
function closingBrace(pattern: string, from: number): number {
  for (let index = from; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '\\') index += 1;
    else if (char === '}') return index;
    else if (char === '{') return -1;
  }
  return -1;
}

/** The pattern cut into text runs and `{…}` values; a `{` that is never closed stays text. */
export function patternPieces(pattern: string): PatternPiece[] {
  const pieces: PatternPiece[] = [];
  let text = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern.charAt(index);
    if (char === '\\') {
      text += pattern.slice(index, index + 2);
      index += 1;
      continue;
    }
    const end = char === '{' ? closingBrace(pattern, index + 1) : -1;
    if (end < 0) {
      text += char;
      continue;
    }
    if (text) pieces.push({ kind: 'text', text });
    text = '';
    pieces.push({ kind: 'value', source: pattern.slice(index, end + 1) });
    index = end;
  }
  if (text) pieces.push({ kind: 'text', text });
  return pieces;
}

function filterWords(filter: PatternFilter): string {
  switch (filter.name) {
    case 'signed': return 'signed';
    case 'upper': return 'upper case';
    case 'lower': return 'lower case';
    case 'count': return 'count';
    case 'avg': return 'average';
    case 'lookup': return `from ${filter.table}`;
    case 'join': return `joined by “${filter.text}”`;
  }
}

/** How a value's chip reads: its fields' labels, or its formula in words, then its filters. */
export function chipLook(source: string, labelOf: LabelResolver): ChipLook {
  const ast = parsePatternCached(source);
  const nodes = isExpressionError(ast) ? [] : ast.nodes;
  const [node] = nodes;
  if (!node || nodes.length !== 1 || (node.kind !== 'refs' && node.kind !== 'formula')) return { label: source, problem: true };
  const filters = node.filters.map(filterWords);
  const tail = filters.length > 0 ? ` · ${filters.join(' · ')}` : '';
  if (node.kind === 'formula') return { label: `= ${formulaText(node.formula, labelOf)}${tail}`, problem: false };
  const names = node.refs.map((ref) => labelOf(ref));
  return {
    label: `${node.refs.map((ref, index) => names[index] ?? ref).join(', ')}${tail}`,
    problem: names.some((name) => name === undefined),
  };
}

/**
 * Where a value being typed starts: the offset of the last `{` before `caret`
 * that no `}` closes and no backslash escapes, or -1. What follows it is
 * what the author is looking for.
 */
export function openValueAt(text: string, caret: number): number {
  for (let index = caret - 1; index >= 0; index--) {
    const char = text.charAt(index);
    if (char === '}') return -1;
    if (char !== '{') continue;
    let slashes = 0;
    for (let before = index - 1; before >= 0 && text.charAt(before) === '\\'; before--) slashes += 1;
    return slashes % 2 === 0 ? index : -1;
  }
  return -1;
}
