/**
 * What one import of a Fantasy Statblocks layout gathers while it walks the
 * blocks: the fields the blocks show, and the tally the report is made of.
 */

import { labelFromKey } from '../model/fieldKeys';
import { isReservedKey } from '../model/reservedKeys';
import type { BlockIdSource } from '../model/templateIds';
import type { EntryShape, FieldKey, FieldType, TemplateField } from '../model/templateTypes';
import type { FsImportReport, FsLayoutResolver, FsScriptNote } from './fsLayoutTypes';

/** How sure a block is of its field's type; a surer block retypes the field (a key shown as text and as an image is an image). */
const TYPE_RANK: Readonly<Record<FieldType, number>> = {
  text: 1, rating: 2, number: 2, dice: 2, choice: 2, markdown: 3, image: 4,
  list: 5, scores: 5, entries: 5, pairs: 5, spells: 5,
};
/** A key only a group lists or a pattern reads: text until a block shows it. */
const MENTIONED = 0;

export interface FieldUse {
  /** From the block: a property's `display`, a list's `heading`. */
  label?: string | undefined;
  /** scores: the table's headers. */
  slots?: string[] | undefined;
  /** entries: where each entry keeps its text. */
  entry?: EntryShape | undefined;
}

interface Known {
  field: TemplateField;
  rank: number;
  /** The label came from a block, not from the key. */
  labelled: boolean;
}

/** "Motives & Tactics:" → "Motives & Tactics"; blank and colon-only labels say nothing. */
export function cleanLabel(label: string | undefined): string | undefined {
  const clean = label?.trim().replace(/\s*:$/, '').trim();
  return clean ? clean : undefined;
}

export class FsFieldRegistry {
  private readonly known = new Map<FieldKey, Known>();

  /** A key a field may take: text that is not empty, not padded, and not kept by Atlas, Obsidian or FS. */
  static usable(key: unknown): key is FieldKey {
    return typeof key === 'string' && key !== '' && key === key.trim() && !isReservedKey(key);
  }

  /** A block shows `key` as `type`. Returns false where the key cannot be a field. */
  use(key: unknown, type: FieldType, use: FieldUse = {}): key is FieldKey {
    return this.add(key, type, TYPE_RANK[type], use);
  }

  /** A group lists `key`, or a pattern reads it. */
  mention(key: unknown): key is FieldKey {
    return this.add(key, 'text', MENTIONED, {});
  }

  labelOf(key: FieldKey): string | undefined {
    return this.known.get(key)?.field.label;
  }

  /** The fields in the order the blocks first named them. */
  fields(): TemplateField[] {
    return [...this.known.values()].map(({ field }) => field);
  }

  private add(key: unknown, type: FieldType, rank: number, use: FieldUse): key is FieldKey {
    if (!FsFieldRegistry.usable(key)) return false;
    const label = cleanLabel(use.label);
    const known = this.known.get(key) ?? { field: { key, label: labelFromKey(key), type }, rank: -1, labelled: false };
    if (rank > known.rank) {
      known.field = { key, label: known.field.label, type };
      known.rank = rank;
    }
    if (label && !known.labelled) {
      known.field.label = label;
      known.labelled = true;
    }
    if (known.field.type === type) {
      if (use.slots?.length && !known.field.slots) known.field.slots = use.slots;
      if (use.entry && !known.field.entry) known.field.entry = use.entry;
    }
    this.known.set(key, known);
    return true;
  }
}

export type Outcome = 'full' | 'partial' | 'dropped' | 'script';

/** Counts what became of each FS block, for the report. */
export class FsReportTally {
  private converted = 0;
  private plain = 0;
  private plainFull = 0;
  readonly scripts: FsScriptNote[] = [];
  readonly dropped: string[] = [];
  readonly partial: string[] = [];

  /**
   * One FS block's fate. `code`: it carries JavaScript (or sits inside a
   * script), so it does not count towards what Atlas shows of plain blocks.
   */
  record(outcome: Outcome, code: boolean, sentence?: string): void {
    if (outcome === 'full' || outcome === 'partial') this.converted += 1;
    if (!code) {
      this.plain += 1;
      if (outcome === 'full') this.plainFull += 1;
    }
    if (sentence && outcome === 'dropped' && !this.dropped.includes(sentence)) this.dropped.push(sentence);
    if (sentence && outcome === 'partial' && !this.partial.includes(sentence)) this.partial.push(sentence);
  }

  /** A sentence about the layout as a whole. */
  note(sentence: string): void {
    if (!this.dropped.includes(sentence)) this.dropped.push(sentence);
  }

  report(fields: number): FsImportReport {
    return {
      blocks: this.converted,
      fields,
      scripts: this.scripts,
      dropped: this.dropped,
      partial: this.partial,
      withoutCode: { total: this.plain, full: this.plainFull },
    };
  }
}

export interface ImportContext {
  readonly fields: FsFieldRegistry;
  readonly tally: FsReportTally;
  readonly nextId: BlockIdSource;
  readonly resolveLayout: FsLayoutResolver | undefined;
  /** Ids of the layouts being read, outermost first: a layout never includes itself. */
  readonly including: string[];
  /** FS blocks that may still be read; included layouts can multiply a small file. */
  budget: number;
}

/** Ids the same for the same layout: "fs000000", "fs000001", … */
export function sequentialBlockIds(): BlockIdSource {
  let next = 0;
  return () => `fs${(next++).toString(36).padStart(6, '0')}`;
}
