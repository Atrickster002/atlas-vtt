import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findBlock } from '../../model/treeQueries';
import { useBlockHandleDrag } from '../dnd/useDragSources';
import { focusToReturn } from '../interaction/chrome';
import { GutterHandle } from '../interaction/GutterHandle';
import { hoverStoreOf, type HoverTarget } from '../interaction/hoverStore';
import type { SurfaceAction } from '../interaction/surfaceActions';
import { useSurfaceMenu } from '../interaction/SurfaceMenuProvider';
import { targetAt, useSurfaceHover } from '../interaction/useSurfaceHover';
import { turnSelectionInto } from './blockActions';
import { clipOf } from './blockClipboard';
import { moveIntoContainer } from './blockMoves';
import { blockFrame } from './editorChrome';
import { moreOptionsInUse } from './inspector/groupSummaries';
import { blockMenu } from './menus/blockMenu';
import { emptyCardMenu, newerTemplateMenu } from './menus/otherMenus';
import { primaryOf, type BlockSelection } from './selection';
import type { SessionSnapshot } from './sessionTypes';
import { addTabTo, splitListIntoTabs } from './tabActions';
import { SelectionToolbar } from './toolbar/SelectionToolbar';
import { CORE_SLOTS, coreSlotOf, type CoreSlotId } from '../../model/coreSlots';
import type { EditorState } from './useEditorState';
import { runBlockCommand, type KeyboardTarget } from './useTemplateKeyboard';
import '../interaction/interaction.scss';

export interface TeSurfaceChromeProps {
  layer: HTMLElement;
  stage: HTMLElement;
  snapshot: SessionSnapshot;
  state: EditorState;
  target: KeyboardTarget;
  /** Shift+F10 or the Menu key asked for the selection's menu. */
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSettings?: (() => void) | undefined;
}

/** What the toolbar calls a core slot. */
function coreLabelOf(slot: CoreSlotId | null): string | null {
  return slot ? CORE_SLOTS[slot].label : null;
}

/** Where a menu opens: at a right-click's point, or hanging from an element. */
type Place = { at: { x: number; y: number } } | { from: Element };

/** Text being typed keeps the browser's own menu. */
const NATIVE_MENU = 'input, textarea, [contenteditable="true"]';

/**
 * The template editor's chrome over the card (spec §3–§5): the gutter handle
 * of the pointed-at block (drag it by the handle only; click for its menu),
 * the five-control toolbar below the selected block, and one menu per block
 * by the handle, a right-click (which selects first), the toolbar's More and
 * Shift+F10.
 */
export function TeSurfaceChrome({ layer, stage, snapshot, state, target, menuOpen, onMenuOpenChange, onSettings }: TeSurfaceChromeProps): React.JSX.Element {
  const store = useMemo(() => hoverStoreOf(stage), [stage]);
  const stageRef = useMemo(() => ({ current: stage }), [stage]);
  const editable = !snapshot.readOnly;
  const menu = useSurfaceMenu();
  const drag = useBlockHandleDrag(stage, editable);
  const latest = useRef({ snapshot, state, target });
  latest.current = { snapshot, state, target };
  useSurfaceHover(stageRef, store, { items: false, enabled: true, ignore: '.atlas-te-chrome' });

  const copy = useCallback((text: string): void => { void stage.win.navigator.clipboard?.writeText(text); }, [stage]);

  /** The block's menu acting on the selection that holds it, else on the block alone, which it selects first (§4.1). */
  const menuOf = useCallback((blockId: string): SurfaceAction[] => {
    const { snapshot: now, state: editor, target: keys } = latest.current;
    if (now.readOnlyReason === 'newer') return newerTemplateMenu();
    const selection: BlockSelection = editor.selection.includes(blockId) ? editor.selection : [blockId];
    if (selection !== editor.selection) editor.select(selection, false);
    const acting: KeyboardTarget = { ...keys, selection };
    return blockMenu({
      session: keys.session, template: now.template, selection, blockId, editable: !now.readOnly, canPaste: clipOf(keys.clipOwner) !== null,
      run: (command) => runBlockCommand(acting, command),
      turnInto: (type) => editor.settle(turnSelectionInto(keys.session, selection, type)),
      openInsert: (place) => editor.openInsert(place),
      moveInto: (containerId) => editor.settle(moveIntoContainer(keys.session, blockId, containerId), true),
      openSettings: onSettings,
      copyText: copy,
      addTab: () => editor.settle(addTabTo(keys.session, blockId)),
      splitIntoTabs: () => editor.settle(splitListIntoTabs(keys.session, blockId)),
    });
  }, [onSettings, copy]);

  const [menuShown, setMenuShown] = useState(false);
  const open = useCallback((rows: SurfaceAction[], place: Place, mark: HTMLElement | null, returnFocus: HTMLElement | null): void => {
    if (!menu || rows.length === 0) return;
    store.menuOpenedOn(mark);
    setMenuShown(true);
    const options = { returnFocus, onClose: () => { store.menuClosed(); setMenuShown(false); } };
    if ('at' in place) menu.openAt(rows, place.at, options);
    else menu.openFrom(rows, place.from, options);
  }, [menu, store]);

  const emptyMenu = useCallback((): SurfaceAction[] => {
    const { state: editor, target: keys, snapshot: now } = latest.current;
    return emptyCardMenu({
      editable: !now.readOnly,
      canPaste: clipOf(keys.clipOwner) !== null,
      addAtEnd: () => editor.openInsert({ after: null }),
      pasteAtEnd: () => runBlockCommand({ ...keys, selection: [] }, 'paste'),
      openSettings: onSettings,
    });
  }, [onSettings]);

  // A right-click on the card: its block's menu (selected first), or the card's own on empty space.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      const node = event.target as Partial<Element> | null;
      if (typeof node?.closest === 'function' && node.closest(NATIVE_MENU)) return;
      event.preventDefault();
      const found = targetAt(stage, event.target, false);
      const at = { x: event.clientX, y: event.clientY };
      if (found) open(menuOf(found.blockId), { at }, found.element, null);
      else open(emptyMenu(), { at }, null, null);
    };
    stage.addEventListener('contextmenu', onContextMenu);
    return () => stage.removeEventListener('contextmenu', onContextMenu);
  }, [stage, open, menuOf, emptyMenu]);

  // Shift+F10 and the Menu key: the primary block's menu, hanging from it, focus back to it after.
  useEffect(() => {
    if (!menuOpen) return;
    onMenuOpenChange(false);
    const primary = primaryOf(latest.current.state.selection);
    const frame = primary ? blockFrame(stage, primary) : null;
    if (primary && frame) open(menuOf(primary), { from: frame }, frame, frame);
  }, [menuOpen, onMenuOpenChange, open, menuOf, stage]);

  // The toolbar covers the line below its block; a right-click on it is meant for that line.
  const menuBelow = (point: { x: number; y: number }): void => {
    const under = stage.ownerDocument.elementsFromPoint(point.x, point.y).find((element) => stage.contains(element));
    const found = under ? targetAt(stage, under, false) : null;
    if (found) open(menuOf(found.blockId), { at: point }, found.element, null);
    else open(emptyMenu(), { at: point }, null, null);
  };

  const primary = primaryOf(state.selection);
  const block = primary ? findBlock(snapshot.template.layout.blocks, primary)?.block : undefined;
  const frameOf = (id: string): HTMLElement | null => blockFrame(stage, id);

  return (
    <>
      <GutterHandle
        store={store}
        layer={layer}
        glyphOf={() => (snapshot.readOnlyReason === 'newer' ? 'lock' : 'grip')}
        labelOf={() => (snapshot.readOnlyReason === 'newer' ? 'From a newer Atlas' : 'Drag to move · Click for options')}
        onMenu={(hovered: HoverTarget, handle) => open(menuOf(hovered.blockId), { from: handle }, hovered.element, focusToReturn(handle))}
        onPress={(hovered, event) => { if (editable) drag(hovered.blockId, event); }}
      />
      {primary && block && state.editing === null && (
        <SelectionToolbar
          layer={layer}
          stage={stage}
          block={block}
          count={state.selection.length}
          editable={editable}
          revision={snapshot.template}
          settingsInUse={moreOptionsInUse(block)}
          coreLabel={coreLabelOf(state.selection.length === 1 ? coreSlotOf(snapshot.template.layout, block.id) : null)}
          onTurnInto={(chip) => {
            const turn = menuOf(primary).find((row) => row.kind === 'submenu' && row.id === 'turn-into');
            if (turn?.kind === 'submenu') open(turn.children, { from: chip }, frameOf(primary), frameOf(primary));
          }}
          onSettings={onSettings}
          onAddBelow={() => state.openInsert({ after: primary })}
          onDelete={() => runBlockCommand(target, 'delete')}
          onMore={(button) => open(menuOf(primary), { from: button }, frameOf(primary), frameOf(primary))}
          menuOpen={menuShown}
          onMenuBelow={menuBelow}
        />
      )}
    </>
  );
}
