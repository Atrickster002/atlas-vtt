import type { FieldKey, LineBlock, StatBlock, TemplateBlock, TitleBlock } from '../../model/templateTypes';
import { escapePatternText } from '../../expressions/patternParse';
import type { SheetState } from '../sheetState';
import { NO_TEXT, fieldPattern, hasText, problemsOf, shownField, shownPattern, type ShownText } from './shownText';

/** Blocks whose values are one line of text that a pattern may write. */
export type PatternBlock = TitleBlock | LineBlock | StatBlock;

const DEFAULT_LINE_SEPARATOR = ' ';

/** A Line without a pattern: its non-empty fields joined by its separator. */
function lineText(block: LineBlock, sheet: SheetState): ShownText {
  const parts = block.fields.filter((key) => key !== '').map((key) => shownField(key, sheet));
  return {
    text: parts.filter(hasText).map((part) => part.text).join(block.separator ?? DEFAULT_LINE_SEPARATOR),
    problems: problemsOf(parts),
  };
}

/** A field's value, signed where asked, then the field's unit ("30 ft."). */
function unitPattern(key: FieldKey, signed: boolean, sheet: SheetState): string {
  const unit = sheet.fields.get(key)?.unit?.trim();
  const value = fieldPattern(key, signed);
  return unit ? `${value} ${escapePatternText(unit)}` : value;
}

/** One number of a Metric as it shows: its field with the field's unit. */
export function metricNumberText(key: FieldKey, sheet: SheetState): ShownText {
  return key ? shownPattern(unitPattern(key, false, sheet), sheet, key) : NO_TEXT;
}

/** The text a Title, Line or Stat shows for the statblock. */
export function blockText(block: PatternBlock, sheet: SheetState): ShownText {
  switch (block.type) {
    case 'title':
      if (!block.field) return NO_TEXT;
      return block.pattern ? shownPattern(block.pattern, sheet, block.field) : shownField(block.field, sheet);
    case 'line':
      return block.pattern ? shownPattern(block.pattern, sheet, block.fields[0]) : lineText(block, sheet);
    case 'stat':
      if (!block.field) return NO_TEXT;
      return shownPattern(block.pattern ?? unitPattern(block.field, block.display === 'signed', sheet), sheet, block.field);
  }
}

export function isPatternBlock(block: TemplateBlock): block is PatternBlock {
  return block.type === 'title' || block.type === 'line' || block.type === 'stat';
}
