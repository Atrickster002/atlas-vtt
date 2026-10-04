/**
 * The parts every statblock has: its name and its token art. A template
 * always holds a Name heading (a Title showing `name`) and a token picture (an
 * Image showing `image`); they can be moved and set side by side like any
 * block, never deleted, turned into another block or bound to another
 * property. A template without one gets it on reading (`withCoreSlots`), in
 * memory like a migration, written with the next real edit. Pure.
 */

import { canContain } from './blockCatalogue';
import { fieldByKey } from './fieldKeys';
import { done, parentTypeOf, refuse, spliced, withChildren, type TreeEdit } from './treeEdit';
import { insertBlock, removeBlock } from './treeOps';
import { collectBlockIds, findBlock, flattenReadingOrder } from './treeQueries';
import {
  TEMPLATE_VERSION, isContainerBlock, type FieldKey, type ImageBlock, type StatblockTemplate, type TemplateBlock,
  type TemplateField, type TemplateLayout, type TitleBlock,
} from './templateTypes';

export type CoreSlotId = 'name' | 'token';

interface CoreSlotSpec {
  id: CoreSlotId;
  /** How the editor names the block. */
  label: string;
  field: TemplateField;
  blockType: 'title' | 'image';
}

export const CORE_SLOTS: Readonly<Record<CoreSlotId, CoreSlotSpec>> = {
  name: { id: 'name', label: 'Name', field: { key: 'name', label: 'Name', type: 'text' }, blockType: 'title' },
  token: { id: 'token', label: 'Token art', field: { key: 'image', label: 'Token art', type: 'image' }, blockType: 'image' },
};

const SLOT_IDS: readonly CoreSlotId[] = ['name', 'token'];

/** Block ids a template given its slots on reading uses, so the same file reads the same every time. */
const ADDED_IDS: Readonly<Record<CoreSlotId | 'row', string>> = { name: 'corename', token: 'coretokn', row: 'corehead' };

function isSlotBlock(block: TemplateBlock, slot: CoreSlotSpec): boolean {
  return block.type === slot.blockType && (block as TitleBlock | ImageBlock).field === slot.field.key;
}

/** Whether a property is one the core slots show (`name`, `image`): its key never changes. */
export function isCoreSlotKey(key: FieldKey): boolean {
  return SLOT_IDS.some((id) => CORE_SLOTS[id].field.key === key);
}

/** The block that is each core slot: the first in reading order of the slot's type showing its property. */
export function coreSlotBlocks(layout: TemplateLayout): Map<string, CoreSlotId> {
  const slots = new Map<string, CoreSlotId>();
  const all = flattenReadingOrder(layout.blocks);
  for (const id of SLOT_IDS) {
    const block = all.find((candidate) => isSlotBlock(candidate, CORE_SLOTS[id]));
    if (block) slots.set(block.id, id);
  }
  return slots;
}

/** The core slot a block is, or null. */
export function coreSlotOf(layout: TemplateLayout, blockId: string): CoreSlotId | null {
  return coreSlotBlocks(layout).get(blockId) ?? null;
}

/** The core slots inside a block (itself included), in reading order. */
function coreSlotsWithin(layout: TemplateLayout, block: TemplateBlock): TemplateBlock[] {
  const slots = coreSlotBlocks(layout);
  return flattenReadingOrder([block]).filter((inner) => slots.has(inner.id));
}

/** The nearest place at or above the block's that takes `type`: inside a Tabs block, past the Tabs. */
function placeFor(layout: TemplateLayout, parentId: string | null, index: number, type: TemplateBlock['type']): { parentId: string | null; index: number } | null {
  let place: { parentId: string | null; index: number } = { parentId, index };
  for (let depth = 0; depth < 64; depth++) {
    const parentType = parentTypeOf(layout, place.parentId);
    if (parentType !== null && canContain(parentType, type)) return place;
    const parent = place.parentId === null ? null : findBlock(layout.blocks, place.parentId);
    if (!parent) return null;
    place = { parentId: parent.parentId, index: parent.index + 1 };
  }
  return null;
}

/**
 * Deletes a block with everything inside it but the core slots, which stay
 * where it stood (past a Tabs block, which takes Sections only). Refused for
 * a core slot itself.
 */
export function deleteBlock(layout: TemplateLayout, id: string): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  if (coreSlotOf(layout, id)) return refuse(layout, 'core-slot');
  const kept = isContainerBlock(found.block) ? coreSlotsWithin(layout, found.block) : [];
  const removed = removeBlock(layout, id);
  if (!removed.ok || kept.length === 0) return removed;
  let next = removed.layout;
  for (const [offset, block] of kept.entries()) {
    const place = placeFor(next, found.parentId, found.index + offset, block.type);
    const edit = place ? insertBlock(next, block, place) : refuse(next, 'not-allowed-here');
    if (!edit.ok) return refuse(layout, edit.reason);
    next = edit.layout;
  }
  return done(next, null);
}

function withField(fields: readonly TemplateField[], field: TemplateField): TemplateField[] {
  return fieldByKey(fields, field.key) ? [...fields] : [...fields, field];
}

/** An id for a block added on reading: its own fixed one, else (taken) the next free from it. */
function freeId(wanted: string, taken: Set<string>): string {
  let id = wanted;
  for (let step = 0; taken.has(id) && step < 36; step++) id = `${wanted.slice(0, 7)}${step.toString(36)}`;
  taken.add(id);
  return id;
}

/** The token picture beside the Name: into the Row the Name stands in (or right after it where no Row may stand), else both in a new Row in the Name's place. */
function tokenBesideName(layout: TemplateLayout, nameId: string, token: ImageBlock, rowId: string): TemplateLayout {
  const name = findBlock(layout.blocks, nameId);
  if (!name) return layout;
  const parentType = parentTypeOf(layout, name.parentId);
  if (parentType === null || parentType === 'row' || !canContain(parentType, 'row')) {
    return withChildren(layout, name.parentId, (children) => spliced(children, name.index + 1, 0, token));
  }
  const row: TemplateBlock = { id: rowId, type: 'row', blocks: [name.block, token] };
  return withChildren(layout, name.parentId, (children) => spliced(children, name.index, 1, row));
}

/**
 * The template with its core slots: a missing Name heading goes first, a
 * missing token picture beside the Name, and their properties are added where
 * the template lacks them. A template that has both comes back as the same
 * object; one of a newer format is read-only and is left as it is.
 */
export function withCoreSlots(template: StatblockTemplate): StatblockTemplate {
  if (template.version > TEMPLATE_VERSION) return template;
  const slots = new Set(coreSlotBlocks(template.layout).values());
  if (slots.has('name') && slots.has('token')) return template;
  const taken = collectBlockIds(template.layout.blocks);
  let layout = template.layout;
  let fields: TemplateField[] = [...template.fields];
  let nameId = [...coreSlotBlocks(layout).entries()].find(([, slot]) => slot === 'name')?.[0] ?? null;
  if (!nameId) {
    nameId = freeId(ADDED_IDS.name, taken);
    const name: TitleBlock = { id: nameId, type: 'title', field: CORE_SLOTS.name.field.key as FieldKey, level: 1 };
    layout = { ...layout, blocks: [name, ...layout.blocks] };
    fields = withField(fields, CORE_SLOTS.name.field);
  }
  if (!slots.has('token')) {
    const token: ImageBlock = { id: freeId(ADDED_IDS.token, taken), type: 'image', field: CORE_SLOTS.token.field.key as FieldKey, shape: 'token' };
    layout = tokenBesideName(layout, nameId, token, freeId(ADDED_IDS.row, taken));
    fields = withField(fields, CORE_SLOTS.token.field);
  }
  return { ...template, fields, layout };
}
