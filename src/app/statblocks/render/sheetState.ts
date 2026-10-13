import type { PatternContext } from '../expressions/pattern';
import type { Lookups } from '../expressions/filters';
import { withHeaderFields } from '../model/templateHeader';
import type { FieldKey, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { fieldLabels, readField, readerFor, type FieldRecord, type ValueReader } from '../values/fieldValues';
import { startTableValue } from '../values/tableValues';
import type { SheetMode, StatblockTokenContext } from './sheetTypes';

/** What deciding and writing a block's text needs; no React, no Obsidian. */
export interface SheetState {
  /** The note's fields as they are stored, a Table without a value holding its template's starting table. */
  record: FieldRecord;
  reader: ValueReader;
  fields: ReadonlyMap<FieldKey, TemplateField>;
  /** Lookup tables and field labels for patterns and formulas. */
  context: PatternContext;
  mode: SheetMode;
  /** The token the statblock is shown for: its art and resource values show in Image and Track blocks. */
  token: StatblockTokenContext | undefined;
  /** Blocks folded into chips under the card (`foldRule.ts`): not drawn, and no value of theirs is edited. */
  folded: ReadonlySet<string>;
  /** The field a tile not named yet is drawn with, named after its kind (`provisionalSheet.ts`); never stored. */
  provisional?: TemplateField | undefined;
}

export interface SheetStateInput {
  template: StatblockTemplate;
  record: FieldRecord;
  /** Tables beside the template's own; one of the same name replaces the template's. */
  lookups?: Lookups | undefined;
  mode: SheetMode;
  token?: StatblockTokenContext | undefined;
  folded?: ReadonlySet<string> | undefined;
}

const NONE_FOLDED: ReadonlySet<string> = new Set();

/**
 * The record with every Table that holds no value holding its template's starting table, as a new statblock
 * shows it until its first edit writes its own (`tableValues`). The same record where none is filled.
 */
function withStartingTables(record: FieldRecord, fields: readonly TemplateField[]): FieldRecord {
  const filled: [string, unknown][] = [];
  for (const field of fields) {
    const value = readField(record, field).value;
    if (field.type !== 'scores' || (value !== undefined && value !== null)) continue;
    const start = startTableValue(field);
    if (start !== undefined) filled.push([field.key, start]);
  }
  return filled.length > 0 ? { ...record, ...Object.fromEntries(filled) } : record;
}

export function sheetState({ template, record: stored, lookups, mode, token, folded }: SheetStateInput): SheetState {
  // A template not read from a file (one being made, a test's) may lack a header part's field: the part still has its name and prompt.
  const { fields } = withHeaderFields(template);
  const record = withStartingTables(stored, fields);
  return {
    record,
    reader: readerFor(record, fields),
    fields: new Map(fields.map((field) => [field.key, field])),
    context: {
      lookups: { ...template.lookups, ...lookups },
      labelOf: fieldLabels(fields),
    },
    mode,
    token,
    folded: folded ?? NONE_FOLDED,
  };
}
