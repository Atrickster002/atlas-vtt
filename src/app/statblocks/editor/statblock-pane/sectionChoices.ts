/**
 * What "Add a section…" offers beside a note (spec §8.3) and the template
 * edit each choice makes. The template's own folded sections come first
 * (choosing one unfolds it, nothing changes in the template), then the
 * sections statblocks commonly have, then the note's values the template
 * does not show, then, once a name is typed, a new section of each kind.
 * Pure.
 */

import { blockFor } from '../../model/autoTemplate';
import { bindsFieldType, naturalBlockFor } from '../../model/blockCatalogue';
import { addField } from '../../model/fieldOps';
import { fieldKeysOf, labelToKey } from '../../model/fieldKeys';
import { blockIdSource } from '../../model/templateIds';
import { insertBlock } from '../../model/treeOps';
import { boundField, collectBlockIds, findBlock, flattenReadingOrder } from '../../model/treeQueries';
import type { EntriesBlock, FieldKey, FieldType, StatblockTemplate, TemplateBlock, TemplateField } from '../../model/templateTypes';
import type { FoldedBlock } from '../../render/foldRule';
import type { FieldRecord } from '../../values/fieldValues';
import { insertTarget } from '../template-editor/blockMoves';
import { singular } from './entryNoun';
import { noteFieldChoices, noteKeyChoice } from './fieldChoices';

/** A section a choice adds: the property it shows (an existing key, or one made from the label) and its heading. */
export interface NewSection {
  key: FieldKey | null;
  label: string;
  type: FieldType;
  /** The heading drawn above it, where it differs from the label ("Spellcasting" for Spells). */
  heading?: string | undefined;
}

export type SectionChoice =
  | { kind: 'unfold'; id: string; label: string; detail: string; blockId: string }
  | { kind: 'add'; id: string; label: string; detail: string; section: NewSection };

export interface SectionGroup {
  id: string;
  label: string;
  choices: SectionChoice[];
}

/** The sections statblocks of most systems have, in the order rulebooks print them. */
const COMMON: ReadonlyArray<NewSection & { detail: string }> = [
  { key: 'traits', label: 'Traits', type: 'entries', detail: 'Abilities that are always on' },
  { key: 'spells', label: 'Spells', type: 'spells', heading: 'Spellcasting', detail: 'Spells by level' },
  { key: 'actions', label: 'Actions', type: 'entries', detail: 'What it does on its turn' },
  { key: 'bonus_actions', label: 'Bonus Actions', type: 'entries', detail: 'A list of bonus actions' },
  { key: 'reactions', label: 'Reactions', type: 'entries', detail: 'What it does out of turn' },
  { key: 'legendary_actions', label: 'Legendary Actions', type: 'entries', detail: 'Actions between turns' },
  { key: 'lair_actions', label: 'Lair Actions', type: 'entries', detail: 'What its lair does' },
  { key: 'features', label: 'Features', type: 'entries', detail: 'A list of features' },
  { key: 'description', label: 'Description', type: 'markdown', detail: 'A paragraph about it' },
  { key: 'tactics', label: 'Tactics', type: 'markdown', detail: 'How it fights' },
  { key: 'loot', label: 'Loot', type: 'list', detail: 'What it carries' },
];

/** The order rulebooks print sections in: a new one lands among them in its place (spec §8.3). */
const BOOK_ORDER: readonly FieldKey[] = [
  'traits', 'features', 'spells', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions', 'description', 'tactics', 'loot',
];

/** The kinds a new section may have, in plain words. */
const NEW_KINDS: ReadonlyArray<{ type: FieldType; words: (name: string) => string }> = [
  { type: 'entries', words: (name) => `A list of abilities called “${name}”` },
  { type: 'text', words: (name) => `A stat called “${name}”` },
  { type: 'markdown', words: (name) => `A paragraph called “${name}”` },
  { type: 'list', words: (name) => `Tags called “${name}”` },
];

const normal = (text: string): string => text.trim().toLowerCase().replace(/[\s_]+/g, ' ');

/** Whether a block of the template already shows this section: by its property or by its heading. */
function shown(template: StatblockTemplate, section: NewSection): boolean {
  return flattenReadingOrder(template.layout.blocks).some((block) => {
    const heading = 'heading' in block && typeof block.heading === 'string' ? normal(block.heading) : null;
    return (section.key !== null && boundField(block) === section.key)
      || heading === normal(section.label) || (section.heading !== undefined && heading === normal(section.heading));
  });
}

function matches(choice: SectionChoice, query: string): boolean {
  const words = normal(query).split(' ').filter(Boolean);
  const text = normal(`${choice.label} ${choice.detail}`);
  return words.every((word) => text.includes(word));
}

/** The menu's groups for what is typed; empty groups left out. */
export function sectionGroups(
  template: StatblockTemplate, record: FieldRecord, folded: readonly FoldedBlock[], query: string,
): SectionGroup[] {
  const name = query.trim();
  const inTemplate: SectionChoice[] = folded.map((block) => ({
    kind: 'unfold', id: `unfold:${block.blockId}`, label: block.heading, detail: 'In this template', blockId: block.blockId,
  }));
  const common: SectionChoice[] = COMMON.filter((section) => !shown(template, section)).map(({ detail, ...section }) => ({
    kind: 'add', id: `common:${section.key ?? section.label}`, label: section.label, detail, section,
  }));
  const fromNote: SectionChoice[] = noteFieldChoices(record, template).map((choice) => ({
    kind: 'add', id: `note:${choice.key ?? choice.label}`, label: choice.label, detail: 'Has a value in this note',
    section: { key: choice.key, label: choice.label, type: choice.type },
  }));
  const fresh: SectionChoice[] = name
    ? NEW_KINDS.map(({ type, words }) => ({ kind: 'add', id: `new:${type}`, label: words(name), detail: '', section: { key: null, label: name, type } }))
    : [];
  const groups: SectionGroup[] = [
    { id: 'template', label: 'In this template', choices: inTemplate.filter((choice) => matches(choice, query)) },
    { id: 'common', label: 'Sections', choices: common.filter((choice) => matches(choice, query)) },
    { id: 'note', label: 'Values of this note', choices: fromNote.filter((choice) => matches(choice, query)) },
    { id: 'new', label: 'New', choices: fresh },
  ];
  return groups.filter((group) => group.choices.length > 0);
}

/** The property the section shows: the template's own of that key where a block of the section's kind can show it, else a new one. */
function sectionField(template: StatblockTemplate, section: NewSection): { field: TemplateField; isNew: boolean } {
  const own = section.key === null ? undefined : template.fields.find((field) => field.key === section.key);
  if (own && bindsFieldType(naturalBlockFor(section.type), own.type)) return { field: own, isNew: false };
  const key = section.key !== null && !own ? section.key : labelToKey(section.label, fieldKeysOf(template.fields));
  return { field: { key, label: section.label, type: section.type }, isNew: true };
}

/** The block a section gets: headed where its kind draws a heading, with the menu's verbs for a list ("Add trait"). */
function sectionBlock(field: TemplateField, section: NewSection, template: StatblockTemplate): TemplateBlock {
  const block = blockFor({ ...field, label: section.label }, blockIdSource(collectBlockIds(template.layout.blocks)));
  switch (block.type) {
    case 'entries': return { ...block, heading: section.label, addLabel: `Add ${singular(section.label).toLowerCase()}` } satisfies EntriesBlock;
    case 'spells': return { ...block, heading: section.heading ?? section.label };
    case 'text': return { ...block, heading: section.label };
    default: return block;
  }
}

/** Where a section lands without an anchor: among the book's sections in their order, else at the end. */
function naturalAnchor(template: StatblockTemplate, key: FieldKey): { after: string } | { before: string } | null {
  const rank = BOOK_ORDER.indexOf(key);
  if (rank < 0) return null;
  const ranked = flattenReadingOrder(template.layout.blocks)
    .map((block) => ({ block, rank: BOOK_ORDER.indexOf(boundField(block) ?? '') }))
    .filter((each) => each.rank >= 0);
  const before = ranked.filter((each) => each.rank < rank).at(-1);
  if (before) return { after: before.block.id };
  const after = ranked.find((each) => each.rank > rank);
  return after ? { before: after.block.id } : null;
}

export interface SectionAddition {
  template: StatblockTemplate;
  blockId: string;
  key: FieldKey;
}

/**
 * The template with the section added: its property (where the template
 * lacks it) and its block, after `after` (a block menu's "Add a section
 * below"), else in its place among the book's sections, else at the end.
 * Null where the template refused it.
 */
export function sectionAddition(template: StatblockTemplate, section: NewSection, after: string | null): SectionAddition | null {
  const { field, isNew } = sectionField(template, section);
  const withField = isNew ? addField(template, field) : template;
  if (isNew && withField === template) return null;
  const block = sectionBlock(field, section, withField);
  const layout = withField.layout;
  const anchor = after !== null ? { after } : naturalAnchor(withField, field.key);
  let target = { parentId: null as string | null, index: layout.blocks.length };
  if (anchor && 'after' in anchor) target = insertTarget(layout, anchor.after, block.type);
  else if (anchor) {
    const found = findBlock(layout.blocks, anchor.before);
    if (found) target = { parentId: found.parentId, index: found.index };
  }
  const edit = insertBlock(layout, block, target);
  if (!edit.ok) return null;
  return { template: { ...withField, layout: edit.layout }, blockId: block.id, key: field.key };
}

/** The tray's "Put on the card" for a value of the note the template does not show: the block its value suggests. */
export function noteSectionChoice(key: FieldKey, record: FieldRecord): SectionChoice {
  const choice = noteKeyChoice(key, record);
  return { kind: 'add', id: `note:${key}`, label: choice.label, detail: '', section: { key, label: choice.label, type: choice.type } };
}
