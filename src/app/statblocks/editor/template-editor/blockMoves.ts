/**
 * Moving blocks without a drag (§7.7): Alt+↑/↓ steps a block past its
 * neighbour and, at the ends of its container, out of it; Alt+→ puts it into
 * the container before it, Alt+← takes it out of its own.
 */

import { canContain } from '../../model/blockCatalogue';
import { moveBlock } from '../../model/treeOps';
import { childrenOf, parentTypeOf, type TreeEdit, type TreeTarget } from '../../model/treeEdit';
import { findBlock } from '../../model/treeQueries';
import { isContainerBlock, type BlockType, type TemplateField, type TemplateLayout } from '../../model/templateTypes';
import { blockName, placeName } from './blockNames';
import { inSiblingOrder, primaryOf, type BlockSelection } from './selection';
import { applyTree, chainTree, outcomeOf, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';

/**
 * Where a block inserted after `anchorId` goes: into it where it is an empty
 * container that takes the type (an empty tab), else right after it, or,
 * where its parent does not take that type (a Row in a Row), after the
 * parent. Without an anchor, at the end of the top level.
 */
export function insertTarget(layout: TemplateLayout, anchorId: string | null, type: BlockType): TreeTarget {
  let found = anchorId === null ? null : findBlock(layout.blocks, anchorId);
  // An empty Section or Side by side fills first: nothing in it to add below.
  const anchor = found?.block;
  if (anchor && isContainerBlock(anchor) && anchor.blocks.length === 0 && canContain(anchor.type, type)) return { parentId: anchor.id, index: 0 };
  while (found) {
    const parentType = parentTypeOf(layout, found.parentId);
    if (parentType !== null && canContain(parentType, type)) return { parentId: found.parentId, index: found.index + 1 };
    found = found.parentId === null ? null : findBlock(layout.blocks, found.parentId);
  }
  return { parentId: null, index: layout.blocks.length };
}

/** "Moved Armor class to section Defenses, position 2 of 3." */
export function movedMessage(layout: TemplateLayout, id: string, fields: readonly TemplateField[]): string {
  const found = findBlock(layout.blocks, id);
  if (!found) return '';
  const parent = found.parentId === null ? null : findBlock(layout.blocks, found.parentId)?.block ?? null;
  const count = childrenOf(layout, found.parentId)?.length ?? 0;
  return `Moved ${blockName(found.block, fields)} to ${placeName(parent, fields)}, position ${found.index + 1} of ${count}.`;
}

/** The place just before (`step` -1) or after (1) a block's parent, in the grandparent. */
function besideParent(layout: TemplateLayout, parentId: string | null, step: 1 | -1): TreeTarget | null {
  const parent = parentId === null ? null : findBlock(layout.blocks, parentId);
  if (!parent) return null;
  return { parentId: parent.parentId, index: step === -1 ? parent.index : parent.index + 1 };
}

/** The moves of a step up or down: each selected block past its neighbour, or a lone block out of its container's end. */
function stepMoves(layout: TemplateLayout, ids: readonly string[], step: 1 | -1): Array<(layout: TemplateLayout) => TreeEdit> | null {
  const ordered = inSiblingOrder(layout, ids);
  const edge = findBlock(layout.blocks, (step === -1 ? ordered[0] : ordered.at(-1)) ?? '');
  if (!edge) return null;
  const length = childrenOf(layout, edge.parentId)?.length ?? 0;
  const atEnd = step === -1 ? edge.index === 0 : edge.index === length - 1;
  if (atEnd) {
    const target = ordered.length === 1 ? besideParent(layout, edge.parentId, step) : null;
    return target ? [(current) => moveBlock(current, edge.block.id, target)] : null;
  }
  const sequence = step === -1 ? ordered : [...ordered].reverse();
  return sequence.map((id) => (current: TemplateLayout) => {
    const found = findBlock(current.blocks, id);
    return moveBlock(current, id, { parentId: found?.parentId ?? null, index: (found?.index ?? 0) + step });
  });
}

function moveOutcome(session: EditorSession, edit: TreeEdit | null, primary: string): EditOutcome {
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, (done) => ({ announce: movedMessage(done.layout, primary, snapshot.template.fields) }));
}

/** Alt+↑ / Alt+↓. */
export function moveSelection(session: EditorSession, selection: BlockSelection, step: 1 | -1): EditOutcome {
  const primary = primaryOf(selection);
  if (primary === null) return {};
  let moved = false;
  const edit = applyTree(session, (layout) => {
    const moves = stepMoves(layout, selection, step);
    moved = moves !== null;
    return moves ? chainTree(layout, moves) : { ok: true, layout, focus: primary };
  });
  if (edit && !moved) return { announce: step === -1 ? 'Already at the top.' : 'Already at the end.' };
  return moveOutcome(session, edit, primary);
}

/** Alt+→: into the container just before the block, at its end. */
export function moveIntoPrevious(session: EditorSession, id: string): EditOutcome {
  let into: string | null = null;
  const edit = applyTree(session, (layout) => {
    const found = findBlock(layout.blocks, id);
    const previous = found && found.index > 0 ? childrenOf(layout, found.parentId)?.[found.index - 1] : undefined;
    if (!previous || !isContainerBlock(previous)) return { ok: true, layout, focus: id };
    into = previous.id;
    return moveBlock(layout, id, { parentId: previous.id, index: previous.blocks.length });
  });
  if (edit && into === null) return { announce: 'There is no section or row before it.' };
  return moveOutcome(session, edit, id);
}

/** Alt+←: out of its container, right after it. */
export function moveOutOfParent(session: EditorSession, id: string): EditOutcome {
  let out = false;
  const edit = applyTree(session, (layout) => {
    const target = besideParent(layout, findBlock(layout.blocks, id)?.parentId ?? null, 1);
    if (!target) return { ok: true, layout, focus: id };
    out = true;
    return moveBlock(layout, id, target);
  });
  if (edit && !out) return { announce: 'Already at the top level.' };
  return moveOutcome(session, edit, id);
}

/** Move ▸ Into: to the end of a container (the menu offers the block's sibling containers). */
export function moveIntoContainer(session: EditorSession, id: string, containerId: string): EditOutcome {
  const edit = applyTree(session, (layout) => {
    const container = findBlock(layout.blocks, containerId)?.block;
    if (!container || !isContainerBlock(container)) return { ok: false, layout, reason: 'not-a-container' };
    return moveBlock(layout, id, { parentId: containerId, index: container.blocks.length });
  });
  return moveOutcome(session, edit, id);
}
