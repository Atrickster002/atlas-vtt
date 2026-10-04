/**
 * The Outline tab's rows (§7.4), as pure functions of the layout: every block
 * in reading order with its depth and place, leaving out what lies inside a
 * folded container, and the moves the tree's keys make between them.
 */

import { isContainerBlock, type TemplateBlock } from '../../model/templateTypes';

export interface OutlineRow {
  block: TemplateBlock;
  /** 1 at the top level, as `aria-level` counts. */
  level: number;
  parentId: string | null;
  /** Its place among its siblings (1-based) and how many there are: `aria-posinset`, `aria-setsize`. */
  position: number;
  siblings: number;
  /** A Section or Row, which folds; `null` for any other block. */
  expanded: boolean | null;
}

/** The rows shown while the containers in `folded` are folded. */
export function outlineRows(blocks: readonly TemplateBlock[], folded: ReadonlySet<string>): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (list: readonly TemplateBlock[], level: number, parentId: string | null): void => {
    list.forEach((block, index) => {
      const container = isContainerBlock(block);
      const expanded = container ? !folded.has(block.id) : null;
      rows.push({ block, level, parentId, position: index + 1, siblings: list.length, expanded });
      if (isContainerBlock(block) && expanded) visit(block.blocks, level + 1, block.id);
    });
  };
  visit(blocks, 1, null);
  return rows;
}

/** The containers a block lies in, outermost first; empty at the top level or for an unknown id. */
export function containersAround(blocks: readonly TemplateBlock[], id: string): string[] {
  for (const block of blocks) {
    if (block.id === id) return [];
    if (!isContainerBlock(block)) continue;
    const inner = containersAround(block.blocks, id);
    if (inner.length > 0 || block.blocks.some((child) => child.id === id)) return [block.id, ...inner];
  }
  return [];
}

export type OutlineMove = 'previous' | 'next' | 'first' | 'last' | 'parent' | 'first-child';

/** The row a key moves to from `id` (the first row where nothing is focused), or null where it moves nowhere. */
export function outlineStep(rows: readonly OutlineRow[], id: string | null, move: OutlineMove): string | null {
  const index = id === null ? -1 : rows.findIndex((row) => row.block.id === id);
  const at = (position: number): string | null => rows[position]?.block.id ?? null;
  switch (move) {
    case 'first': return at(0);
    case 'last': return at(rows.length - 1);
    case 'previous': return index < 0 ? at(0) : at(index - 1);
    case 'next': return index < 0 ? at(0) : at(index + 1);
    case 'parent': return index < 0 ? null : rows[index]?.parentId ?? null;
    case 'first-child': {
      const next = rows[index + 1];
      return index >= 0 && next?.parentId === id ? next.block.id : null;
    }
  }
}
