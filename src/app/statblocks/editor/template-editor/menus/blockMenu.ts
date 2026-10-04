/**
 * A block's menu in the template editor (spec §5.2): the same rows by
 * right-click, its handle, the toolbar's More and Shift+F10. Settings and
 * renaming first, the block's quick choices, then where it goes and what it
 * is, copies, the power rows behind "Advanced", and Delete last. Move up and
 * Move down stay at the ends, disabled, so the menu keeps its shape. At most
 * twelve rows: quick choices give way first.
 */

import { PRIMITIVES, canContain, type AuthorableBlockType, type PrimitiveId } from '../../../model/blockCatalogue';
import { coreSlotOf } from '../../../model/coreSlots';
import { childrenOf, parentTypeOf } from '../../../model/treeEdit';
import { boundField, findBlock } from '../../../model/treeQueries';
import { isListBlockType } from '../../../model/treeTabs';
import { turnInto, turnIntoPrimitives, typeForPrimitive } from '../../../model/turnInto';
import { isContainerBlock, type StatblockTemplate, type TemplateBlock } from '../../../model/templateTypes';
import { MAX_MENU_ROWS, rowCount, SEPARATOR, tidy, type SurfaceAction } from '../../interaction/surfaceActions';
import type { InsertPlace } from '../blockActions';
import { blockName, placeName } from '../blockNames';
import type { KeyCommand } from '../keyCommands';
import { labelTargetOf } from '../labelTargets';
import { inSiblingOrder, type BlockSelection } from '../selection';
import type { EditorSession } from '../sessionTypes';
import { shortcutText } from '../shortcutText';
import { quickChoices } from './quickChoices';

/** The primitives a block turns into where it stands: a container only into one its place and its children allow. */
function turnablePrimitives(template: StatblockTemplate, block: TemplateBlock): PrimitiveId[] {
  const primitives = turnIntoPrimitives(block.type);
  if (!isContainerBlock(block)) return primitives;
  return primitives.filter((id) => turnInto(template.layout, block.id, typeForPrimitive(block, id, template.fields), template.fields).ok);
}

export interface BlockMenuContext {
  session: EditorSession;
  template: StatblockTemplate;
  /** What the menu acts on: the block it opened on, or the selection that holds it. */
  selection: BlockSelection;
  blockId: string;
  editable: boolean;
  canPaste: boolean;
  /** The command of a key, run on the selection. */
  run: (command: KeyCommand) => void;
  turnInto: (type: AuthorableBlockType) => void;
  openInsert: (place: InsertPlace) => void;
  moveInto: (containerId: string) => void;
  openSettings?: (() => void) | undefined;
  copyText: (text: string) => void;
  /** A Tabs block's Add tab. */
  addTab?: (() => void) | undefined;
  /** A list's Split into tabs. */
  splitIntoTabs?: (() => void) | undefined;
}

/** Add tab on a Tabs block, Split into tabs (in Arrange) on a list. */
function tabRows(ctx: BlockMenuContext, block: TemplateBlock, parentId: string | null): { head: SurfaceAction[]; arrange: SurfaceAction[] } {
  const { addTab, splitIntoTabs, editable } = ctx;
  if (block.type === 'tabs' && addTab) return { head: [item('add-tab', 'Add tab', addTab, { icon: 'plus', disabled: !editable })], arrange: [] };
  if (!isListBlockType(block.type) || !splitIntoTabs) return { head: [], arrange: [] };
  const parentType = parentTypeOf(ctx.template.layout, parentId);
  const fits = parentType !== null && canContain(parentType, 'tabs');
  return { head: [], arrange: [item('split-into-tabs', 'Split into tabs', splitIntoTabs, { disabled: !editable || !fits })] };
}

function item(id: string, label: string, run: () => void, extra: Partial<Extract<SurfaceAction, { kind: 'item' }>> = {}): SurfaceAction {
  return { kind: 'item', id, label, run, ...extra };
}

function moveRows(ctx: BlockMenuContext, block: TemplateBlock, parentId: string | null, index: number): SurfaceAction[] {
  const { template, editable } = ctx;
  const siblings = childrenOf(template.layout, parentId) ?? [];
  const parent = parentId === null ? null : findBlock(template.layout.blocks, parentId)?.block ?? null;
  const topFirst = parentId === null && index === 0;
  const topLast = parentId === null && index === siblings.length - 1;
  const into = siblings.filter((sibling) => sibling.id !== block.id && isContainerBlock(sibling));
  return [
    item('move-up', 'Up', () => ctx.run('move-up'), { hint: shortcutText(['Alt'], '↑'), disabled: !editable || topFirst }),
    item('move-down', 'Down', () => ctx.run('move-down'), { hint: shortcutText(['Alt'], '↓'), disabled: !editable || topLast }),
    ...(parent ? [item('move-out', `Out of ${placeName(parent, template.fields)}`, () => ctx.run('move-out'), { hint: shortcutText(['Alt'], '←'), disabled: !editable })] : []),
    ...(editable && into.length ? [{
      kind: 'submenu' as const, id: 'move-into', label: 'Into',
      children: into.map((container) => item(`into-${container.id}`, blockName(container, template.fields), () => ctx.moveInto(container.id))),
    }] : []),
  ];
}

function advancedRows(ctx: BlockMenuContext, block: TemplateBlock): SurfaceAction[] {
  const key = boundField(block);
  const settings = ctx.openSettings;
  return [
    ...(settings && ctx.editable ? [item('show-when', 'Show only when…', settings), item('theme-class', 'Theme class…', settings)] : []),
    ...(key ? [item('copy-key', 'Copy property name', () => ctx.copyText(key))] : []),
  ];
}

export function blockMenu(ctx: BlockMenuContext): SurfaceAction[] {
  const { template, editable } = ctx;
  const found = findBlock(template.layout.blocks, ctx.blockId);
  if (!found) return [];
  const { block } = found;
  const many = ctx.selection.length > 1;
  const what = many ? `${ctx.selection.length} blocks` : blockName(block, template.fields);
  const ordered = inSiblingOrder(template.layout, ctx.selection);
  const last = ordered.at(-1) ?? ctx.blockId;
  // The Name and the token picture stay what they are (`coreSlots`).
  const core = !many && coreSlotOf(template.layout, block.id) !== null;
  const turnable = editable && !many && !core ? turnablePrimitives(template, block) : [];
  const tabs = many ? { head: [], arrange: [] } : tabRows(ctx, block, found.parentId);
  const head: SurfaceAction[] = [
    ...(ctx.openSettings && !many ? [item('settings', 'Settings…', ctx.openSettings, { icon: 'settings-2', hint: shortcutText(['Shift'], '⏎') })] : []),
    ...(editable && !many && labelTargetOf(block, template.fields) ? [item('rename', 'Rename', () => ctx.run('edit-label'), { icon: 'pencil', hint: '⏎' })] : []),
    ...tabs.head,
  ];
  const body: SurfaceAction[] = [
    SEPARATOR,
    {
      kind: 'submenu', id: 'add', label: 'Add', icon: 'plus',
      children: [
        item('add-above', 'Above…', () => ctx.openInsert({ at: { parentId: found.parentId, index: found.index } }), { disabled: !editable }),
        item('add-below', 'Below…', () => ctx.openInsert({ after: last }), { disabled: !editable, hint: '/' }),
      ],
    },
    {
      kind: 'submenu', id: 'turn-into', label: 'Turn into', icon: 'replace',
      children: turnable.map((id) => item(`turn-${id}`, PRIMITIVES[id].label,
        () => ctx.turnInto(typeForPrimitive(block, id, template.fields)), { icon: PRIMITIVES[id].icon })),
    },
    { kind: 'submenu', id: 'move', label: 'Move', icon: 'move', children: moveRows(ctx, block, found.parentId, found.index) },
    {
      kind: 'submenu', id: 'arrange', label: 'Arrange', icon: 'layout-grid',
      children: [
        item('group', 'Group into section', () => ctx.run('group'), { hint: shortcutText(['Mod'], 'G'), disabled: !editable }),
        item('side-by-side', 'Put side by side', () => ctx.run('side-by-side'), { hint: shortcutText(['Mod', 'Alt'], 'R'), disabled: !editable }),
        ...(isContainerBlock(block) ? [item('ungroup', 'Ungroup', () => ctx.run('ungroup'), { hint: shortcutText(['Mod', 'Shift'], 'G'), disabled: !editable })] : []),
        ...tabs.arrange,
      ],
    },
    SEPARATOR,
    item('duplicate', 'Duplicate', () => ctx.run('duplicate'), { icon: 'copy-plus', hint: shortcutText(['Mod'], 'D'), disabled: !editable }),
    item('copy', 'Copy', () => ctx.run('copy'), { icon: 'copy', hint: shortcutText(['Mod'], 'C') }),
    ...(ctx.canPaste ? [item('paste', 'Paste below', () => ctx.run('paste'), { icon: 'clipboard-paste', hint: shortcutText(['Mod'], 'V'), disabled: !editable })] : []),
    ...(many ? [] : [{ kind: 'submenu' as const, id: 'advanced', label: 'Advanced', icon: 'sliders-horizontal', children: advancedRows(ctx, block) }]),
    SEPARATOR,
    item('delete', many ? `Delete ${what}` : 'Delete', () => ctx.run('delete'), { icon: 'trash-2', hint: 'Del', destructive: true, disabled: !editable || core }),
  ];
  // Quick choices give way first, so the menu never runs past twelve rows.
  const room = MAX_MENU_ROWS - rowCount(tidy([...head, ...body]));
  const quick = editable && !many ? quickChoices(ctx.session, block, ctx.openSettings).slice(0, Math.max(0, Math.min(2, room))) : [];
  return tidy([...head, ...quick, ...body]);
}
