/**
 * The statblock template format: a field schema plus a tree of blocks.
 * Pure data, no Obsidian and no React (a lint rule keeps it that way).
 */

export const TEMPLATE_FORMAT = 'atlas-statblock-template';
export const TEMPLATE_VERSION = 1;
export const BUILT_IN_TEMPLATE_PREFIX = 'builtin:';

/** `builtin:<slug>` for built-ins, `<slug>-<6 base36>` for vault templates. Never changes. */
export type TemplateId = string;
/** A top-level frontmatter key of a statblock note. */
export type FieldKey = string;
export type FieldValue = string | number | boolean | null | FieldValue[] | { [key: string]: FieldValue };

export interface StatblockTemplate {
  format: typeof TEMPLATE_FORMAT;
  version: number;
  id: TemplateId;
  /** The name is the file's basename (built-ins: `BuiltInTemplate.name`); it is never stored in the file. */
  description?: string;
  /** Role names it suits; a hint for pickers, never a restriction. */
  suits?: string[];
  /** What a statblock of this template holds, in form order (Tab order in the statblock pane). */
  fields: TemplateField[];
  layout: TemplateLayout;
  /** Tables patterns read with `{cr|lookup:xp}`. */
  lookups?: Record<string, Record<string, string>>;
  /** Values the template editor previews with when no statblock is picked. Never creature content in built-ins. */
  sample?: Record<FieldKey, FieldValue>;
  /** The template it was copied from, with the built-in's revision at the time. */
  derivedFrom?: { templateId: TemplateId; revision?: number };
  /** Licence and attribution of a licensed built-in; copied with the template and kept on copies. */
  source?: TemplateSource;
  /** The FS layout it was imported from, and layout-level keys Atlas does not model. Code-bearing keys among the extras are code. */
  importedFrom?: { layoutId: string; layoutName: string; extras?: Record<string, unknown> };
}

export type FieldType =
  | 'text'      // one line, inline Markdown
  | 'markdown'  // paragraphs
  | 'number'
  | 'rating'    // "1/4", "½", "3+1*", whole numbers stored as numbers
  | 'dice'      // "7d10 + 14": validated, rollable, average shown
  | 'choice'    // one of `options` (or any, if `open`)
  | 'list'      // string list
  | 'scores'    // number array, one value per slot
  | 'entries'   // list of { name, desc, ...extras }
  | 'pairs'     // { dex: 5 } or [{ dex: 5 }]
  | 'image'     // vault path
  | 'spells';   // FS spell shape: strings or { level: spells }

export const FIELD_TYPES: readonly FieldType[] = [
  'text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'entries', 'pairs', 'image', 'spells',
];

/** What Atlas uses a field for when its key is not the conventional one. */
export type FieldMeaning =
  | 'hit-points' | 'armor' | 'rating' | 'size' | 'creature-type' | 'senses' | 'initiative' | 'traits';

export const FIELD_MEANINGS: readonly FieldMeaning[] = [
  'hit-points', 'armor', 'rating', 'size', 'creature-type', 'senses', 'initiative', 'traits',
];

export interface TemplateField {
  key: FieldKey;
  label: string;
  type: FieldType;
  meaning?: FieldMeaning;
  /** Keys this field had before renames, newest first; read when `key` is absent. */
  formerKeys?: FieldKey[];
  /** number: written after the value ("ft."). */
  unit?: string;
  /** choice: offered values; `open` accepts others too. */
  options?: string[];
  open?: boolean;
  /** scores: one label per slot, in stored order. */
  slots?: string[];
  /** scores: the key of each slot where a Scores column reads a pairs field ("strength"). Default: the labels in lower case. */
  slotKeys?: string[];
  /** entries: the keys inside an entry. */
  entry?: EntryShape;
  /** Prompt for an empty value in the statblock pane ("Add speed"). */
  prompt?: string;
}

export interface EntryShape {
  /** Default 'name'. */
  nameKey?: string;
  /** Default 'desc' (FS); FS's Daggerheart notes use 'text'. */
  textKey?: string;
  /** Short labelled parts shown before the text ("Range", "Cost"). */
  extras?: Array<{ key: string; label: string; type: 'text' | 'number' | 'list' | 'dice' }>;
}

export interface TemplateLayout {
  /** Most columns at full width. Default 2. */
  maxColumns: 1 | 2 | 3;
  /** Least column width in em. Default 22. */
  columnWidth?: number;
  blocks: TemplateBlock[];
}

export type Condition =
  | { field: FieldKey; is: 'present' | 'absent' }
  | { field: FieldKey; is: 'equal' | 'not-equal'; value: string | number | boolean }
  | { field: FieldKey; is: 'above' | 'below'; value: number };

export interface BlockBase {
  /** 8 base36, unique in the template; selection, undo, chrome and FS block ids follow it. */
  id: string;
  showWhen?: Condition;
  /** Unset: hidden while every field it shows is empty. */
  whenEmpty?: 'hide' | 'fallback';
  /** A pattern, so it may derive a value from other fields; never stored in the note. */
  fallback?: string;
  /** Exposed as `data-cls` for themes; FS `cls`. */
  className?: string;
  /** Inside a Row: 'fit' sizes to content, 'fill' shares the free width. Default per block type. */
  size?: 'fit' | 'fill';
  /** Keys of an imported FS block that Atlas does not model; written back on export. Code-bearing keys among them are code. */
  fsExtras?: Record<string, unknown>;
}

export interface SectionBlock extends BlockBase { type: 'section'; heading?: string; headingField?: FieldKey; collapsible?: 'open' | 'closed'; blocks: TemplateBlock[] }
export interface RowBlock extends BlockBase { type: 'row'; align?: 'start' | 'center' | 'spread'; blocks: TemplateBlock[] }
/** Sections shown one at a time; each Section's heading is its tab's label. Holds Sections only. */
export interface TabsBlock extends BlockBase { type: 'tabs'; blocks: TemplateBlock[] }
export interface TitleBlock extends BlockBase { type: 'title'; field: FieldKey; level: 1 | 2 | 3; pattern?: string }
export interface LineBlock extends BlockBase { type: 'line'; fields: FieldKey[]; pattern?: string; separator?: string }
export interface StatBlock extends BlockBase { type: 'stat'; field: FieldKey; label?: string; look: 'run-in' | 'stacked'; pattern?: string; display?: 'plain' | 'signed'; rollFrom?: FieldKey }
/** An extra column of a Scores block: per slot, the slot's entry in a pairs field (by `slotKeys`), else the formula over the slot's score (`value`). */
export interface ScoreColumn { label?: string; field?: FieldKey; formula?: string; display?: 'plain' | 'signed' }
export interface ScoresBlock extends BlockBase {
  type: 'scores';
  field: FieldKey;
  /** 'row': labels over values. 'table': one line per slot, its score and its columns. */
  orientation: 'row' | 'table';
  /** table: slots side by side per line; fewer where the width does not hold them. */
  perLine?: number;
  /** How the slot values themselves show. */
  display?: 'plain' | 'signed';
  columns?: ScoreColumn[];
}
/** A list of words: run in after its label with commas, as chips, or one per line with bullets or numbers. */
export interface TagsBlock extends BlockBase { type: 'tags'; field: FieldKey; label?: string; look: 'comma' | 'chips' | 'bullets' | 'numbered' }
export interface TextBlock extends BlockBase { type: 'text'; field?: FieldKey; text?: string; heading?: string }
export interface EntriesBlock extends BlockBase { type: 'entries'; field: FieldKey; heading?: string; introField?: FieldKey; nameStyle?: 'run-in' | 'heading'; addLabel?: string }
export interface PairsBlock extends BlockBase { type: 'pairs'; field: FieldKey; label?: string; display?: 'plain' | 'signed' }
export interface TrackBlock extends BlockBase { type: 'track'; field: FieldKey; label?: string; resource?: string; look: 'boxes' | 'gauge'; counts: 'down' | 'up' }
export interface ImageBlock extends BlockBase { type: 'image'; field: FieldKey; shape: 'token' | 'portrait' }
/** `look: 'tabs'` shows each group as a tab, loose lines above the strip; unset is 'lines'. */
export interface SpellsBlock extends BlockBase { type: 'spells'; field: FieldKey; heading?: string; look?: 'lines' | 'tabs' }
export interface HeadingBlock extends BlockBase { type: 'heading'; text: string; level: 'section' | 'minor' }
export interface DividerBlock extends BlockBase { type: 'divider' }
/** FS JavaScript preserved verbatim from an import. Never authored, never run by the native renderer, never bundled. */
export interface ScriptBlock extends BlockBase { type: 'script'; summary: string; fs: Record<string, unknown> }
/** A block of a type this Atlas does not know (a newer template). Renders nothing and is written back as it was read. */
export interface OpaqueBlock extends BlockBase { type: 'opaque'; raw: Record<string, unknown> }

export type TemplateBlock =
  | SectionBlock | RowBlock | TabsBlock | TitleBlock | LineBlock | StatBlock | ScoresBlock | TagsBlock | TextBlock
  | EntriesBlock | PairsBlock | TrackBlock | ImageBlock | SpellsBlock | HeadingBlock | DividerBlock | ScriptBlock | OpaqueBlock;

export type BlockType = TemplateBlock['type'];
export type ContainerBlock = SectionBlock | RowBlock | TabsBlock;
export type ContainerType = ContainerBlock['type'];

export function isContainerType(type: BlockType): type is ContainerType {
  return type === 'section' || type === 'row' || type === 'tabs';
}

export function isContainerBlock(block: TemplateBlock): block is ContainerBlock {
  return isContainerType(block.type);
}

/** A list of words whose items stand on their own (chips, bullets, numbers): it shows a label only where the template gives one. */
export function wordsStandAlone(block: TemplateBlock): boolean {
  return block.type === 'tags' && block.look !== 'comma';
}

export type TemplateLicence =
  | 'CC-BY-4.0' | 'CC-BY-3.0' | 'CC-BY-SA-4.0' | 'ORC' | 'DS-Creator' | 'RTG-Homebrew' | 'Paizo-CUP';

export interface TemplateSource {
  /** "5E (2024 rules)". */
  system: string;
  /** The one quiet line on cards: "SRD 5.2.1 · CC BY 4.0". */
  label: string;
  licences: TemplateLicence[];
  /** Verbatim; a unit test checks it appears in THIRD_PARTY_NOTICES.md. */
  attribution: string;
  licenceUrl: string;
  sourceUrl?: string;
  /** "Atlas VTT arranged the stat block structure as an editable template." */
  modification: string;
  /** A non-affiliation or trademark line, only where the licence or policy asks for one. */
  trademarkNotice?: string;
}

export type BuiltInTemplateId = `${typeof BUILT_IN_TEMPLATE_PREFIX}${string}`;

export interface BuiltInTemplate {
  id: BuiltInTemplateId;
  name: string;
  /** Raised with every change of layout or labels; never with a removed key (append-only, snapshot-tested). */
  revision: number;
  template: StatblockTemplate;
}

export function isBuiltInTemplateId(id: TemplateId): id is BuiltInTemplateId {
  return id.startsWith(BUILT_IN_TEMPLATE_PREFIX);
}
