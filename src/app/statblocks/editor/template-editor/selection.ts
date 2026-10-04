/**
 * The template editor's selection (§7.6), as pure functions of the layout: one
 * block, or siblings picked with Shift+click. The last id is the primary one,
 * which the block toolbar hangs from and focus follows.
 */

import { findBlock, flattenReadingOrder } from '../../model/treeQueries';
import { isContainerBlock, type TemplateLayout } from '../../model/templateTypes';

export type BlockSelection = readonly string[];

export const NO_SELECTION: BlockSelection = [];

/** The block the toolbar, the label editor and the keys act on. */
export function primaryOf(selection: BlockSelection): string | null {
  return selection.at(-1) ?? null;
}

/** The ids that still name a block, in the order they were picked; the same array when all do. */
export function existingSelection(layout: TemplateLayout, selection: BlockSelection): BlockSelection {
  const kept = selection.filter((id) => findBlock(layout.blocks, id) !== null);
  return kept.length === selection.length ? selection : kept;
}

/**
 * Shift+click: adds a sibling of the selection, or takes a picked block out
 * again. A block of another parent starts a new selection.
 */
export function withSibling(layout: TemplateLayout, selection: BlockSelection, id: string): BlockSelection {
  if (selection.includes(id)) return selection.filter((picked) => picked !== id);
  const target = findBlock(layout.blocks, id);
  const first = selection[0] === undefined ? null : findBlock(layout.blocks, selection[0]);
  if (!target) return selection;
  return first && first.parentId === target.parentId ? [...selection, id] : [id];
}

/** The selected blocks in the order they stand in their parent. */
export function inSiblingOrder(layout: TemplateLayout, selection: BlockSelection): string[] {
  return selection
    .map((id) => findBlock(layout.blocks, id))
    .filter((found) => found !== null)
    .sort((a, b) => a.index - b.index)
    .map((found) => found.block.id);
}

/** The container holding the primary block, or null at the top level. */
export function parentOf(layout: TemplateLayout, id: string | null): string | null {
  return id === null ? null : findBlock(layout.blocks, id)?.parentId ?? null;
}

/**
 * The block before or after the primary one in reading order (each block
 * before its children), skipping those the canvas does not draw. Without a
 * selection, the first (or last) drawn block.
 */
export function stepInReadingOrder(
  layout: TemplateLayout, primary: string | null, step: 1 | -1, drawn: (id: string) => boolean,
): string | null {
  const order = flattenReadingOrder(layout.blocks).map((block) => block.id).filter(drawn);
  if (order.length === 0) return null;
  if (primary === null) return step === 1 ? order[0] ?? null : order.at(-1) ?? null;
  const index = order.indexOf(primary);
  if (index < 0) return order[0] ?? null;
  return order[index + step] ?? null;
}

/** A container's first drawn child. */
export function firstChildOf(layout: TemplateLayout, id: string | null, drawn: (id: string) => boolean): string | null {
  const found = id === null ? null : findBlock(layout.blocks, id);
  if (!found || !isContainerBlock(found.block)) return null;
  return found.block.blocks.find((child) => drawn(child.id))?.id ?? null;
}

/**
 * Where focus goes once the selected blocks are deleted: the next sibling
 * after them, else their parent, else the sibling before them.
 */
export function focusAfterDelete(layout: TemplateLayout, selection: BlockSelection): string | null {
  const ordered = inSiblingOrder(layout, selection);
  const first = ordered[0] === undefined ? null : findBlock(layout.blocks, ordered[0]);
  if (!first) return null;
  const siblings = first.parentId === null ? layout.blocks : (() => {
    const parent = findBlock(layout.blocks, first.parentId ?? '');
    return parent && isContainerBlock(parent.block) ? parent.block.blocks : [];
  })();
  const removed = new Set(ordered);
  const last = siblings.findIndex((block) => block.id === ordered.at(-1));
  const next = siblings.slice(last + 1).find((block) => !removed.has(block.id));
  if (next) return next.id;
  if (first.parentId !== null) return first.parentId;
  return siblings.slice(0, first.index).reverse().find((block) => !removed.has(block.id))?.id ?? null;
}
