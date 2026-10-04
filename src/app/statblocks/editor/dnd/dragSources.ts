/**
 * What a drag carries (§7.6): a block of the canvas, a palette item, or a
 * field from the Fields tab; and the block types each puts into the template.
 */

import { createBlock } from '../../model/blockCatalogue';
import { blockFor } from '../../model/autoTemplate';
import { fieldByKey } from '../../model/fieldKeys';
import type { BlockIdSource } from '../../model/templateIds';
import { findBlock } from '../../model/treeQueries';
import type { FieldKey, StatblockTemplate, TemplateBlock, TemplateField } from '../../model/templateTypes';
import type { InsertItem } from '../template-editor/insertItems';
import type { DragSubject } from './dropTargets';

export type DragSource =
  | { kind: 'block'; id: string }
  | { kind: 'item'; item: InsertItem }
  | { kind: 'field'; key: FieldKey };

/** What a draggable hands dnd-kit as its `data`. */
export interface DragData {
  source: DragSource | null;
}

/** The source a draggable's data names, if it is one. */
export function sourceOf(data: unknown): DragSource | null {
  if (typeof data !== 'object' || data === null || !('source' in data)) return null;
  const source = (data as DragData).source;
  return source && typeof source === 'object' && 'kind' in source ? source : null;
}

/** The block a field dropped on the canvas gets: its type's natural block, bound to it. */
export function fieldBlock(field: TemplateField, nextId: BlockIdSource): TemplateBlock {
  return field.type === 'image' ? createBlock('image', nextId, field.key) : blockFor(field, nextId);
}

const ids = (): BlockIdSource => {
  let next = 0;
  return () => `drag${(next++).toString(36)}`;
};

/** The blocks a new item or field would put in; empty where there is none. */
function newBlocks(template: StatblockTemplate, source: Exclude<DragSource, { kind: 'block' }>): TemplateBlock[] {
  if (source.kind === 'field') {
    const field = fieldByKey(template.fields, source.key);
    return field ? [fieldBlock(field, ids())] : [];
  }
  return [createBlock(source.item.type, ids())];
}

/** What the drop puts in, for working out where it may go; null where the source names nothing in the template. */
export function subjectOf(template: StatblockTemplate, source: DragSource): DragSubject | null {
  if (source.kind === 'block') {
    const found = findBlock(template.layout.blocks, source.id);
    return found ? { types: [found.block.type], movingId: source.id } : null;
  }
  const blocks = newBlocks(template, source);
  return blocks.length > 0 ? { types: blocks.map((block) => block.type), movingId: null } : null;
}

/** What the source is called in announcements. */
export function sourceName(template: StatblockTemplate, source: DragSource, nameOf: (block: TemplateBlock) => string): string {
  if (source.kind === 'item') return source.item.label;
  if (source.kind === 'field') {
    const field = fieldByKey(template.fields, source.key);
    return field?.label || source.key;
  }
  const found = findBlock(template.layout.blocks, source.id);
  return found ? nameOf(found.block) : 'the block';
}
