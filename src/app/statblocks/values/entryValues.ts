/**
 * Entries fields ("Traits", "Actions"): lists of `{ name, desc, ...extras }`,
 * read through the field's `EntryShape`. An entry written as plain text is
 * all text and no name.
 */

import type { EntryShape, FieldValue } from '../model/templateTypes';
import { isEmptyValue } from './emptyValue';
import { valueText } from './valueText';

export const DEFAULT_ENTRY_NAME_KEY = 'name';
/** Fantasy Statblocks' key; its Daggerheart notes use `text`, which their templates name in `textKey`. */
export const DEFAULT_ENTRY_TEXT_KEY = 'desc';

type EntryExtraShape = NonNullable<EntryShape['extras']>[number];

export interface EntryExtra extends EntryExtraShape {
  value: FieldValue;
}

type EntryRecord = { [key: string]: FieldValue };

export function entryNameKey(shape?: EntryShape): string {
  return shape?.nameKey || DEFAULT_ENTRY_NAME_KEY;
}

export function entryTextKey(shape?: EntryShape): string {
  return shape?.textKey || DEFAULT_ENTRY_TEXT_KEY;
}

function asRecord(entry: FieldValue | undefined): EntryRecord | null {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
}

function textOf(value: FieldValue | undefined): string | undefined {
  const text = valueText(value);
  return text.trim() === '' ? undefined : text;
}

/** The entries of an entries value: a list's non-empty items, or a lone entry. */
export function entryItems(value: FieldValue | undefined): FieldValue[] {
  if (Array.isArray(value)) return value.filter((item) => !isEmptyValue(item));
  return isEmptyValue(value) || value === undefined ? [] : [value];
}

export function entryName(entry: FieldValue | undefined, shape?: EntryShape): string | undefined {
  return textOf(asRecord(entry)?.[entryNameKey(shape)]);
}

export function entryText(entry: FieldValue | undefined, shape?: EntryShape): string | undefined {
  const record = asRecord(entry);
  return record ? textOf(record[entryTextKey(shape)]) : textOf(entry);
}

/** The shape's extras the entry has a value for, in the shape's order. */
export function entryExtras(entry: FieldValue | undefined, shape?: EntryShape): EntryExtra[] {
  const record = asRecord(entry);
  if (!record) return [];
  return (shape?.extras ?? []).flatMap((extra) => {
    const value = record[extra.key];
    return value === undefined || isEmptyValue(value) ? [] : [{ ...extra, value }];
  });
}
