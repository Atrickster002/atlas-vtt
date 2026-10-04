/**
 * Changes to an entries field ("Actions", "Traits"), entry by entry: a name
 * or a text by its path in the list, inserts, moves and removals by the item
 * itself, so a list that was reordered meanwhile still finds the right entry
 * (§8.3) and never writes into another one. Pure.
 */

import type { EntryShape, FieldKey, FieldValue } from '../../model/templateTypes';
import { deepEqual, isFieldMap } from '../../notes/listIdentity';
import type { NotePatch } from '../../notes/patchTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { entryName, entryNameKey, entryText, entryTextKey } from '../../values/entryValues';

export type EntryPart = 'name' | 'text';

/** The list a value holds as entries: a list as it is, one entry, or none. */
export function entryList(value: FieldValue | undefined): FieldValue[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** The indexes of the entries the card shows, in order: empty items and entries without a name or text are left out. */
export function shownEntryIndexes(list: readonly FieldValue[], shape: EntryShape | undefined): number[] {
  return list.flatMap((item, index) => {
    if (isEmptyValue(item)) return [];
    return entryName(item, shape) !== undefined || entryText(item, shape) !== undefined ? [index] : [];
  });
}

/** A new entry with these parts; parts left blank are left out. */
export function newEntry(shape: EntryShape | undefined, name: string, text: string): FieldValue {
  const entry: Record<string, FieldValue> = {};
  if (name.trim()) entry[entryNameKey(shape)] = name.trim();
  if (text.trim()) entry[entryTextKey(shape)] = text.trimEnd();
  return entry;
}

/**
 * Sets an entry's name or text. A record changes the one key; an entry
 * written as plain text is all text, and gets a name by becoming a record.
 * A part made blank is removed.
 */
export function entryPartPatches(list: FieldKey, index: number, item: FieldValue, shape: EntryShape | undefined, part: EntryPart, text: string): NotePatch[] {
  const next = part === 'text' ? text.trimEnd() : text.trim();
  if (isFieldMap(item)) {
    const key = part === 'name' ? entryNameKey(shape) : entryTextKey(shape);
    const base = item[key];
    if (next === '') return base === undefined ? [] : [{ op: 'delete', path: [list, index, key], base }];
    return base !== undefined && deepEqual(base, next) ? [] : [{ op: 'set', path: [list, index, key], base, next }];
  }
  if (part === 'name' && next === '') return [];
  if (next === '') return [removeEntryPatch(list, item)];
  const whole = entryWithPart(item, shape, part, next);
  return deepEqual(item, whole) ? [] : [{ op: 'set', path: [list, index], base: item, next: whole }];
}

/** The entry as it is once its name or text reads `text`: what list operations in the same write must find. */
export function entryWithPart(item: FieldValue, shape: EntryShape | undefined, part: EntryPart, text: string): FieldValue {
  const next = part === 'text' ? text.trimEnd() : text.trim();
  if (isFieldMap(item)) {
    const key = part === 'name' ? entryNameKey(shape) : entryTextKey(shape);
    if (next !== '') return { ...item, [key]: next };
    return Object.fromEntries(Object.entries(item).filter(([name]) => name !== key));
  }
  if (part === 'text') return next;
  return next === '' ? item : { [entryNameKey(shape)]: next, [entryTextKey(shape)]: item };
}

/** Inserts an entry after the item at `afterIndex`, or first. An absent list is made with it. */
export function insertEntryPatch(list: FieldKey, items: readonly FieldValue[], afterIndex: number | null, entry: FieldValue): NotePatch {
  const after = afterIndex === null ? null : items[afterIndex] ?? null;
  return { op: 'insert', list, after, item: entry };
}

/** Moves the entry at `index` one place up (-1) or down (1); null at either end. */
export function moveEntryPatch(list: FieldKey, items: readonly FieldValue[], index: number, step: 1 | -1): NotePatch | null {
  return moveEntryToPatch(list, items, index, index + step);
}

/** Moves the entry at `from` so that it stands at `to` (a drag's drop); null where it stays. */
export function moveEntryToPatch(list: FieldKey, items: readonly FieldValue[], from: number, to: number): NotePatch | null {
  const item = items[from];
  if (item === undefined || to === from || to < 0 || to >= items.length) return null;
  // Placed after the item that will precede it: the one at `to` when moving down, the one before `to` when moving up.
  const afterIndex = to > from ? to : to - 1;
  const after = afterIndex < 0 ? null : items[afterIndex] ?? null;
  return { op: 'move', list, item, after };
}

export function removeEntryPatch(list: FieldKey, item: FieldValue): NotePatch {
  return { op: 'remove', list, item };
}
