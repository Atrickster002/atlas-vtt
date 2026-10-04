/**
 * What a drag says in the view's live region (§7.6, §7.7): what was picked
 * up, where it would go, and how it ended. The drop itself says what the edit
 * did ("Moved Armor class to section Defenses, position 2 of 3.").
 */

import { childrenOf } from '../../model/treeEdit';
import { findBlock } from '../../model/treeQueries';
import type { TemplateField, TemplateLayout } from '../../model/templateTypes';
import { blockName, placeName } from '../template-editor/blockNames';
import type { DropTarget } from './dropTargets';

/** dnd-kit's hidden instructions, read with a block that can be picked up. */
export const DRAG_INSTRUCTIONS = 'To move a block, press Space, choose a place with the arrow keys, then press Space to drop it or Escape to cancel.';

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "Picked up Armor class." and, for the keyboard, how to go on. */
export function pickedUpText(name: string, keyboard: boolean): string {
  return keyboard ? `Picked up ${name}. Choose a place with the arrow keys, then press Space to drop it or Escape to cancel.` : `Picked up ${name}.`;
}

/**
 * Where the drop would land: "Section Defenses, position 2 of 3.", "Into
 * section Defenses.", "Can't go here."
 */
export function targetText(layout: TemplateLayout, fields: readonly TemplateField[], target: DropTarget, movingId: string | null): string {
  if (target.kind === 'refused') return "Can't go here.";
  if (target.kind === 'beside') return besideText(layout, fields, target);
  const parent = target.parentId === null ? null : findBlock(layout.blocks, target.parentId)?.block ?? null;
  if (target.kind === 'into') return target.parentId === null ? 'Into the empty template.' : `Into ${placeName(parent, fields)}.`;
  const moving = movingId === null ? null : findBlock(layout.blocks, movingId);
  const length = childrenOf(layout, target.parentId)?.length ?? 0;
  const staying = moving !== null && moving.parentId === target.parentId;
  const position = staying && target.index > (moving?.index ?? 0) ? target.index : target.index + 1;
  return `${capitalised(placeName(parent, fields))}, position ${position} of ${staying ? length : length + 1}.`;
}

type Beside = Extract<DropTarget, { kind: 'beside' }>;

/** "Beside Name, on its right." */
function besideText(layout: TemplateLayout, fields: readonly TemplateField[], target: Beside): string {
  const found = findBlock(layout.blocks, target.targetId);
  const name = found ? blockName(found.block, fields) : 'the block';
  return `Beside ${name}, on its ${target.side === 'start' ? 'left' : 'right'}.`;
}

/** "Put Picture beside Name, side by side." */
export function besideMessage(layout: TemplateLayout, id: string, target: Beside, fields: readonly TemplateField[]): string {
  const moved = findBlock(layout.blocks, id);
  const other = findBlock(layout.blocks, target.targetId);
  return `Put ${moved ? blockName(moved.block, fields) : 'the block'} beside ${other ? blockName(other.block, fields) : 'the block'}, side by side.`;
}

/** "Cancelled. Armor class stays where it was." */
export function cancelledText(name: string | null): string {
  return name ? `Cancelled. ${name} stays where it was.` : 'Cancelled.';
}
