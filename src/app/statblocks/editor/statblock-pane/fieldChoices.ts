/**
 * The note's own values the template does not show, each as the property its
 * value suggests (the auto template's reading), for "Add a section…" and the
 * tray's "Put on the card". Pure.
 */

import { autoTemplate } from '../../model/autoTemplate';
import { fieldKeysOf, keyProblem, labelFromKey } from '../../model/fieldKeys';
import type { EntryShape, FieldKey, FieldType, StatblockTemplate } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { keysOutsideTemplate } from './templateChoices';

/** A property to show: an existing key keeps its spelling. */
export interface NoteKeyChoice {
  key: FieldKey;
  label: string;
  type: FieldType;
  entry?: EntryShape | undefined;
  slots?: string[] | undefined;
}

/** The property a value's shape suggests, as the auto template reads it; text where no block shows the shape. */
function shapedChoice(key: FieldKey, value: unknown): NoteKeyChoice {
  const field = autoTemplate({ [key]: value }).fields[0];
  if (!field) return { key, label: labelFromKey(key), type: 'text' };
  return { key, label: field.label, type: field.type, entry: field.entry, slots: field.slots };
}

/** The note's values the template does not show, each as the property its value suggests; only keys a template may name. */
export function noteFieldChoices(record: FieldRecord, template: StatblockTemplate): NoteKeyChoice[] {
  const taken = fieldKeysOf(template.fields);
  return keysOutsideTemplate(record, template)
    .filter((key) => keyProblem(key, taken) === null)
    .map((key) => shapedChoice(key, record[key]));
}

/** The choice for a key of the note (the tray's Put on the card). */
export function noteKeyChoice(key: FieldKey, record: FieldRecord): NoteKeyChoice {
  return shapedChoice(key, record[key]);
}
