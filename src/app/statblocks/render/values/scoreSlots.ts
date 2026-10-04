import type { FieldValue, ScoreColumn, ScoresBlock, TemplateField } from '../../model/templateTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { scoreAt, slotKeyOf } from '../../values/fieldValues';
import { formatSigned, numericValue } from '../../values/numberText';
import { pairValue } from '../../values/pairValues';
import { valueText } from '../../values/valueText';
import type { SheetState } from '../sheetState';
import { NO_TEXT, shownPattern, type ShownText } from './shownText';

/** One slot of a Scores block: "Str", its score, and its value in each column. */
export interface ScoreSlot {
  label: string;
  score: ShownText;
  columns: ShownText[];
}

function isTextScore(score: FieldValue | undefined): boolean {
  return score !== undefined && !isEmptyValue(score) && numericValue(score) === null;
}

function shownNumber(value: FieldValue | undefined, signed: boolean): ShownText {
  if (value === undefined || isEmptyValue(value)) return NO_TEXT;
  const number = signed ? numericValue(value) : null;
  return { text: number === null ? valueText(value) : formatSigned(number), problems: [] };
}

/**
 * A column's value in one slot: the slot's entry in the column's pairs field,
 * else its formula over the score. A score written as text ("—", "d8") is
 * shown as it is, and no formula is worked out over it.
 */
function columnValue(
  column: ScoreColumn,
  field: TemplateField,
  index: number,
  score: FieldValue | undefined,
  sheet: SheetState,
): ShownText {
  const signed = column.display === 'signed';
  const label = field.slots?.[index];
  if (column.field) {
    const pair = pairValue(sheet.reader(column.field), slotKeyOf(field, index), label);
    if (pair !== undefined && !isEmptyValue(pair)) return shownNumber(pair, signed);
  }
  if (!column.formula?.trim() || isTextScore(score)) return NO_TEXT;
  return shownPattern(`{=${column.formula}${signed ? '|signed' : ''}}`, sheet, undefined, { value: score, slotLabel: label });
}

/** How many slots to show: the field's labels, else as many as the note holds. */
function slotCount(field: TemplateField, sheet: SheetState): number {
  if (field.slots?.length) return field.slots.length;
  const value = sheet.reader(field.key);
  return Array.isArray(value) ? value.length : 0;
}

/** Every slot of a Scores block as it shows for the statblock. */
export function scoreSlots(block: ScoresBlock, sheet: SheetState): ScoreSlot[] {
  const field: TemplateField = sheet.fields.get(block.field) ?? { key: block.field, label: block.field, type: 'scores' };
  const signed = block.display === 'signed';
  return Array.from({ length: slotCount(field, sheet) }, (_, index): ScoreSlot => {
    const score = scoreAt(sheet.record, field, index);
    return {
      label: field.slots?.[index] ?? '',
      score: shownNumber(score, signed),
      columns: (block.columns ?? []).map((column) => columnValue(column, field, index, score, sheet)),
    };
  });
}

/**
 * The slots in `perLine` groups for the table orientation, each group a
 * column of the card: with three per line, Str and Int share the first
 * ("Str 21 +5 +5 · Dex 9 −1 −1 · Con 17 +3 +3" over "Int · Wis · Cha").
 */
export function scoreGroups(slots: readonly ScoreSlot[], perLine: number | undefined): ScoreSlot[][] {
  const count = Math.max(1, Math.min(Math.floor(perLine ?? 1), slots.length || 1));
  const groups: ScoreSlot[][] = Array.from({ length: count }, () => []);
  slots.forEach((slot, index) => groups[index % count]?.push(slot));
  return groups;
}
