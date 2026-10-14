/**
 * A tile's menu in the template editor (spec §5.2): the same rows by
 * right-click, its handle, the toolbar's More and Shift+F10. Options and
 * renaming first, then where it goes, copies, and Delete last. Move up and
 * Move down stay, disabled at the ends, so the menu keeps its shape. A part
 * of the header is only renamed and, where the template may, hidden or shown
 * (`templateHeader`).
 */

import { gridInsertAbove } from '../../../model/templateGrid';
import { headerPartOf, type HeaderPart } from '../../../model/templateHeader';
import { childrenOf } from '../../../model/treeEdit';
import { boundField, findBlock } from '../../../model/treeQueries';
import type { StatblockTemplate, TemplateBlock } from '../../../model/templateTypes';
import { SEPARATOR, tidy, type SurfaceAction } from '../../interaction/surfaceActions';
import type { InsertPlace } from '../blockActions';
import { blockName } from '../blockNames';
import type { KeyCommand } from '../keyCommands';
import { labelTargetOf } from '../labelTargets';
import { inSiblingOrder, type BlockSelection } from '../selection';
import { shortcutText } from '../shortcutText';
import { tilePartsOf } from '../tileParts';

export interface BlockMenuContext {
  template: StatblockTemplate;
  /** What the menu acts on: the block it opened on, or the selection that holds it. */
  selection: BlockSelection;
  blockId: string;
  editable: boolean;
  canPaste: boolean;
  /** The command of a key, run on the selection. */
  run: (command: KeyCommand) => void;
  openInsert: (place: InsertPlace) => void;
  /** Opens the tile's Options; unset where the tile has none. */
  openOptions?: (() => void) | undefined;
  /** A Metric's numbers: one added at its end, the one at `index` named or taken out. */
  parts?: TilePartActions | undefined;
  copyText: (text: string) => void;
}

function item(id: string, label: string, run: () => void, extra: Partial<Extract<SurfaceAction, { kind: 'item' }>> = {}): SurfaceAction {
  return { kind: 'item', id, label, run, ...extra };
}

export interface TilePartActions {
  add: () => void;
  rename: (index: number) => void;
  remove: (index: number) => void;
}

/** A Metric's numbers (`tileParts`): Add number, then Numbers with a row per number, which renames it or takes it out (never the last one). */
function partRows(ctx: BlockMenuContext, block: TemplateBlock): SurfaceAction[] {
  const { parts: run, template, editable } = ctx;
  const parts = run ? tilePartsOf(template, block.id) : null;
  if (!run || !parts) return [];
  const { noun, names } = parts;
  const last = names.length - 1;
  const rows = names.map((name, index): SurfaceAction => ({
    kind: 'submenu',
    id: `${noun}-${index}`,
    label: name,
    children: [
      item(`rename-${noun}-${index}`, 'Rename', () => run.rename(index), { icon: 'pencil', disabled: !editable }),
      SEPARATOR,
      item(`remove-${noun}-${index}`, 'Remove', () => run.remove(index), { icon: 'x', destructive: true, disabled: !editable || last === 0 }),
    ],
  }));
  return [
    item(`add-${noun}`, `Add ${noun}`, run.add, { icon: 'plus', disabled: !editable || !parts.canAdd }),
    { kind: 'submenu', id: `${noun}s`, label: 'Numbers', icon: 'list', children: rows },
  ];
}

/** A part of the header: Rename and its property's name, then Hide from card or Show on card where it may hide. */
function headerPartMenu(ctx: BlockMenuContext, part: HeaderPart): SurfaceAction[] {
  const { editable } = ctx;
  return tidy([
    ...(editable ? [item('rename', 'Rename', () => ctx.run('edit-label'), { icon: 'pencil', hint: '⏎' })] : []),
    item('copy-key', 'Copy property name', () => ctx.copyText(part.key), { icon: 'tag' }),
    SEPARATOR,
    ...(part.hideable
      ? [item('toggle-hidden', part.hidden ? 'Show on card' : 'Hide from card', () => ctx.run('toggle-hidden'), {
        icon: part.hidden ? 'eye' : 'eye-off', disabled: !editable,
      })]
      : []),
  ]);
}

export function blockMenu(ctx: BlockMenuContext): SurfaceAction[] {
  const { template, editable } = ctx;
  const part = headerPartOf(template, ctx.blockId);
  if (part) return headerPartMenu(ctx, part);
  const found = findBlock(template.layout.blocks, ctx.blockId);
  if (!found) return [];
  const { block } = found;
  const many = ctx.selection.length > 1;
  const what = many ? `${ctx.selection.length} blocks` : blockName(block, template.fields);
  const last = inSiblingOrder(template.layout, ctx.selection).at(-1) ?? ctx.blockId;
  const siblings = childrenOf(template.layout, found.parentId) ?? [];
  const key = boundField(block);
  const parts = many ? [] : partRows(ctx, block);
  // A Table shows no name of its own once it has one: its columns are named in its header row, the table in its Options.
  const renamable = labelTargetOf(block, template.fields) !== null;
  return tidy([
    ...(ctx.openOptions && !many ? [item('options', 'Options…', ctx.openOptions, { icon: 'settings-2', hint: shortcutText(['Shift'], '⏎') })] : []),
    ...(editable && !many && renamable ? [item('rename', 'Rename', () => ctx.run('edit-label'), { icon: 'pencil', hint: '⏎' })] : []),
    SEPARATOR,
    ...parts,
    SEPARATOR,
    item('add-above', 'Add above…', () => ctx.openInsert({ at: gridInsertAbove(template.layout, block.id) }), { icon: 'plus', disabled: !editable }),
    item('add-below', 'Add below…', () => ctx.openInsert({ after: last }), { icon: 'plus', hint: '/', disabled: !editable }),
    item('move-up', 'Move up', () => ctx.run('move-up'), { icon: 'arrow-up', hint: shortcutText(['Alt'], '↑'), disabled: !editable || found.index === 0 }),
    item('move-down', 'Move down', () => ctx.run('move-down'), {
      icon: 'arrow-down', hint: shortcutText(['Alt'], '↓'), disabled: !editable || found.index === siblings.length - 1,
    }),
    SEPARATOR,
    item('duplicate', 'Duplicate', () => ctx.run('duplicate'), { icon: 'copy-plus', hint: shortcutText(['Mod'], 'D'), disabled: !editable }),
    item('copy', 'Copy', () => ctx.run('copy'), { icon: 'copy', hint: shortcutText(['Mod'], 'C') }),
    ...(ctx.canPaste ? [item('paste', 'Paste below', () => ctx.run('paste'), { icon: 'clipboard-paste', hint: shortcutText(['Mod'], 'V'), disabled: !editable })] : []),
    ...(key && !many ? [item('copy-key', 'Copy property name', () => ctx.copyText(key), { icon: 'tag' })] : []),
    SEPARATOR,
    item('delete', many ? `Delete ${what}` : 'Delete', () => ctx.run('delete'), { icon: 'trash-2', hint: 'Del', destructive: true, disabled: !editable }),
  ]);
}
