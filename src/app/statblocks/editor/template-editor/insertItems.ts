/**
 * What the Add panel and the insert menu offer (spec §10.7): each primitive
 * once, by group, with one line saying what it makes; and the small template
 * each one is previewed with, filled with samples.
 */

import {
  PALETTE_GROUPS, PRIMITIVE_IDS, PRIMITIVES, createBlock, primitiveOf, type AuthorableBlockType, type PaletteGroup, type PrimitiveId,
} from '../../model/blockCatalogue';
import type { BlockIdSource } from '../../model/templateIds';
import {
  TEMPLATE_FORMAT, TEMPLATE_VERSION, type FieldType, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from '../../model/templateTypes';

export interface InsertItem {
  primitive: PrimitiveId;
  /** The block type it puts in. */
  type: AuthorableBlockType;
  label: string;
  group: PaletteGroup;
  /** One line saying what it makes. */
  example: string;
  /** Words it is also found by. */
  keywords: readonly string[];
}

/** What each primitive makes, in one line (spec §1), and the words people look for it by. */
const PRIMITIVE_WORDS: Readonly<Record<PrimitiveId, { example: string; keywords: readonly string[] }>> = {
  heading: { example: 'A heading, typed or from a property', keywords: ['title', 'name'] },
  text: { example: 'A paragraph', keywords: ['description', 'notes', 'paragraph'] },
  value: { example: 'A label and its value: Speed 30', keywords: ['stat', 'number', 'property'] },
  line: { example: 'Several values in one sentence', keywords: ['subtitle', 'stats', 'sentence'] },
  list: {
    example: 'Words, labels with values, names with text, or groups',
    keywords: ['abilities', 'actions', 'traits', 'features', 'tags', 'keywords', 'bullets', 'numbered', 'pairs', 'skills', 'spells'],
  },
  table: { example: 'Labels on top, a value under each', keywords: ['ability scores', 'scores', 'attributes', 'stats', 'columns'] },
  track: { example: 'Boxes or a gauge that count up or down', keywords: ['boxes', 'gauge', 'clock', 'counter'] },
  section: { example: 'A heading with blocks under it', keywords: ['group'] },
  'side-by-side': { example: 'Blocks next to each other', keywords: ['row', 'columns'] },
  tabs: { example: 'Sections shown one at a time', keywords: ['tab', 'pages', 'levels', 'kinds'] },
  divider: { example: 'A line across', keywords: ['rule', 'separator'] },
  picture: { example: 'Token art or a portrait', keywords: ['image', 'art', 'portrait', 'token'] },
};

/** The item that puts a block of `type` in: what its primitive offers, putting in this type. */
export function insertItemFor(type: AuthorableBlockType): InsertItem {
  const primitive = primitiveOf(type);
  return { primitive: primitive.id, type, label: primitive.label, group: primitive.group, ...PRIMITIVE_WORDS[primitive.id] };
}

export function itemKey(item: InsertItem): string {
  return `block:${item.type}`;
}

/** Every primitive once, in the order of their groups. */
export function insertItems(): InsertItem[] {
  const order = PALETTE_GROUPS.map((group) => group.id);
  return PRIMITIVE_IDS
    .map((id) => insertItemFor(PRIMITIVES[id].inserts))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** The items whose name, line or other words hold every word typed, in any case ("score" finds Table). */
export function findItems(items: readonly InsertItem[], query: string): InsertItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = `${item.label} ${item.example} ${item.keywords.join(' ')}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Which of the items found the keys start on: one named exactly what was typed ("text" is Text, not Heading),
 * else the first whose name starts with it, else the first.
 */
export function bestMatch(items: readonly InsertItem[], query: string): number {
  const typed = query.trim().toLowerCase();
  if (!typed) return 0;
  const exact = items.findIndex((item) => item.label.toLowerCase() === typed);
  if (exact !== -1) return exact;
  return Math.max(items.findIndex((item) => item.label.toLowerCase().startsWith(typed)), 0);
}

/** The items under their group headings, groups in menu order, empty groups left out. */
export function groupItems(items: readonly InsertItem[]): Array<{ id: PaletteGroup; label: string; items: InsertItem[] }> {
  return PALETTE_GROUPS
    .map((group) => ({ ...group, items: items.filter((item) => item.group === group.id) }))
    .filter((group) => group.items.length > 0);
}

/** The field a block's preview shows, by the type it binds; named after the block. */
const PREVIEW_FIELDS: Partial<Record<AuthorableBlockType, { type: FieldType; slots?: string[] }>> = {
  title: { type: 'text' }, line: { type: 'text' }, stat: { type: 'number' }, scores: { type: 'scores', slots: ['A', 'B', 'C'] },
  tags: { type: 'list' }, text: { type: 'markdown' }, entries: { type: 'entries' }, pairs: { type: 'pairs' },
  track: { type: 'number' }, image: { type: 'image' }, spells: { type: 'spells' },
};

function previewIds(): BlockIdSource {
  let next = 0;
  return () => `preview${(next++).toString(36)}`;
}

function previewParts(item: InsertItem, nextId: BlockIdSource): { blocks: TemplateBlock[]; fields: TemplateField[] } {
  if (item.type === 'section' || item.type === 'row') {
    const fields: TemplateField[] = [{ key: 'first', label: 'First', type: 'number' }, { key: 'second', label: 'Second', type: 'number' }];
    const look = item.type === 'row' ? 'stacked' as const : 'run-in' as const;
    const children = fields.map((field) => ({ ...createBlock('stat', nextId, field.key), look }));
    const container = createBlock(item.type, nextId);
    return { blocks: [{ ...container, blocks: children }], fields };
  }
  if (item.type === 'tabs') {
    const fields: TemplateField[] = [{ key: 'first', label: 'First', type: 'number' }, { key: 'second', label: 'Second', type: 'number' }];
    const tabs = createBlock('tabs', nextId);
    const blocks = tabs.blocks.map((tab, index) => ({ ...tab, blocks: [createBlock('stat', nextId, fields[index]?.key)] }));
    return { blocks: [{ ...tabs, blocks }], fields };
  }
  const shape = PREVIEW_FIELDS[item.type];
  const field: TemplateField | null = shape ? { key: item.type, label: item.label, type: shape.type, ...(shape.slots && { slots: shape.slots }) } : null;
  return { blocks: [createBlock(item.type, nextId, field?.key)], fields: field ? [field] : [] };
}

/** A one-column template holding just the item, for the menu's preview. */
export function previewTemplate(item: InsertItem): StatblockTemplate {
  const { blocks, fields } = previewParts(item, previewIds());
  return { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'preview', fields, layout: { maxColumns: 1, blocks } };
}
