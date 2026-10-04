import type { PatternContext } from '../expressions/pattern';
import type { Lookups } from '../expressions/filters';
import type { FieldKey, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { fieldLabels, readerFor, type FieldRecord, type ValueReader } from '../values/fieldValues';
import type { SheetMode, StatblockTokenContext } from './sheetTypes';

/** What deciding and writing a block's text needs; no React, no Obsidian. */
export interface SheetState {
  /** The note's fields as they are stored; Scores read slots from it. */
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

export function sheetState({ template, record, lookups, mode, token, folded }: SheetStateInput): SheetState {
  return {
    record,
    reader: readerFor(record, template.fields),
    fields: new Map(template.fields.map((field) => [field.key, field])),
    context: {
      lookups: { ...template.lookups, ...lookups },
      labelOf: fieldLabels(template.fields),
    },
    mode,
    token,
    folded: folded ?? NONE_FOLDED,
  };
}
