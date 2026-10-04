import React, { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockTemplate } from '../../model/templateTypes';
import { findBlock } from '../../model/treeQueries';
import type { PaneServices } from '../paneServices';
import { focusToReturn } from '../interaction/chrome';
import { GutterHandle } from '../interaction/GutterHandle';
import { HoverStore, type HoverTarget } from '../interaction/hoverStore';
import { SurfaceLayer } from '../interaction/SurfaceLayer';
import { useSurfaceMenu } from '../interaction/SurfaceMenuProvider';
import { targetAt, useSurfaceHover } from '../interaction/useSurfaceHover';
import { blockName } from '../template-editor/blockNames';
import { UndoToast } from '../template-editor/UndoToast';
import { blockMenuInput } from './paneBlockActions';
import { entryMenuInput } from './paneEntryActions';
import { usePaneEdit } from './paneEditContext';
import { paneBlockMenu, paneEntryMenu } from './paneMenus';
import type { StatblockPaneActions } from './paneTypes';
import { usePaneItemDrag } from './usePaneItemDrag';
import '../interaction/interaction.scss';

export interface PaneHandlesProps {
  /** The pane's root: the card is found in it, and the layer hangs from the panel around it. */
  paneRef: RefObject<HTMLElement | null>;
  template: StatblockTemplate;
  /** The note's template as the library holds it; null while it can't change (missing, newer, loading). */
  entry: LibraryTemplate | null;
  services: PaneServices;
  actions: StatblockPaneActions;
}

const CARD = '.atlas-sb-pane-card';
/** Where a right-click keeps the browser's own menu: text being typed. */
const NATIVE_MENU = 'input, textarea, [contenteditable="true"]';
const HINT_MS = 4000;
/** A right-click here is on a block's label, not its value. */
const LABELS = '.atlas-sb-label, .atlas-sb-heading, .atlas-sb-section-heading';

function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/**
 * The panel's chrome around the card (spec §3, §5.5, §7.2, §8.1): a handle
 * in the gutter of the pointed-at block (⋯, its menu) or ability (⋮⋮: drag it
 * within its list, click for its menu), the same menus on right-click and
 * Shift+F10, and the toast with Undo after a change. Everything floats in a
 * layer outside the scroller and never takes focus, so a value being typed
 * keeps its input through a press on a handle.
 */
export function PaneHandles({ paneRef, template, entry, services, actions }: PaneHandlesProps): React.JSX.Element {
  const pane = usePaneEdit();
  const [store] = useState(() => new HoverStore());
  const cardRef = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const menu = useSurfaceMenu();
  const { sessions, showToast: setToast } = pane;
  const latest = useRef({ pane, template, entry, actions });
  latest.current = { pane, template, entry, actions };

  // After the commit: the pane's root takes its ref after its children's layout effects run.
  useEffect(() => {
    const root = paneRef.current;
    cardRef.current = root?.querySelector<HTMLElement>(CARD) ?? null;
    setHost(root?.closest<HTMLElement>('.atlas-sb-note-panel') ?? root ?? null);
  }, [paneRef]);

  useSurfaceHover(cardRef, store, { items: true, enabled: pane.writable });

  const copy = useCallback((text: string): void => {
    void cardRef.current?.win.navigator.clipboard?.writeText(text);
  }, []);
  const showHint = useCallback((text: string): void => setHint(text), []);
  const press = usePaneItemDrag({ pane, template, hint: showHint });

  useEffect(() => {
    if (!hint) return undefined;
    const win = cardRef.current?.win ?? window;
    const timer = win.setTimeout(() => setHint(null), HINT_MS);
    return () => win.clearTimeout(timer);
  }, [hint]);

  const menuFor = useCallback((target: HoverTarget, onValue = false) => {
    const { pane: now, template: shown, entry: current, actions: wired } = latest.current;
    if (target.kind === 'item' && target.itemKey) {
      const input = entryMenuInput({ pane: now, template: shown, target: { blockId: target.blockId, itemKey: target.itemKey }, element: target.element, copy, toast: setToast });
      return input ? paneEntryMenu(input) : null;
    }
    const input = blockMenuInput({
      app: now.app, pane: now, template: shown, blockId: target.blockId, element: target.element, entry: current, onValue,
      writer: services.writer, sessions, openTemplateAt: wired.openTemplateAt, copy, toast: setToast,
    });
    return input ? paneBlockMenu(input) : null;
  }, [copy, services.writer, sessions]);

  type Place = { at: { x: number; y: number }; onValue: boolean } | { from: Element };
  const open = useCallback((target: HoverTarget, place: Place, returnFocus: HTMLElement | null): void => {
    const rows = menuFor(target, 'at' in place && place.onValue);
    if (!menu || !rows) return;
    store.menuOpenedOn(target.element);
    const options = { returnFocus, onClose: () => store.menuClosed() };
    if ('at' in place) menu.openAt(rows, place.at, options);
    else menu.openFrom(rows, place.from, options);
  }, [menu, menuFor, store]);

  // Right-click and Shift+F10 on the card give the same menus as the handle.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !pane.writable) return undefined;
    const onContextMenu = (event: MouseEvent): void => {
      const node = event.target as Partial<Element> | null;
      if (typeof node?.closest === 'function' && node.closest(NATIVE_MENU)) return;
      const target = targetAt(card, event.target, true);
      if (!target) return;
      event.preventDefault();
      const onValue = target.kind === 'block' && node?.closest?.(LABELS) === null;
      open(target, { at: { x: event.clientX, y: event.clientY }, onValue }, focusToReturn(card));
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isMenuKey(event)) return;
      const target = targetAt(card, event.target, true);
      const focused = event.target as HTMLElement;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      open(target, { from: target.element }, focused);
    };
    card.addEventListener('contextmenu', onContextMenu);
    card.addEventListener('keydown', onKeyDown);
    return () => {
      card.removeEventListener('contextmenu', onContextMenu);
      card.removeEventListener('keydown', onKeyDown);
    };
  }, [open, pane.writable]);

  // The panel's Mod+Z undoes the newest of its own actions in the history that took it.
  const route = useCallback((kind: 'undo' | 'redo') => (kind === 'undo' ? pane.history.undo() : pane.history.redo()), [pane.history]);
  useEffect(() => {
    actions.registerHistory?.(route);
    return () => actions.registerHistory?.(null);
  }, [actions, route]);

  const undo = (): void => {
    const result = pane.history.undo();
    if (result === 'note') services.writer.undo(pane.notePath);
    else if (result === 'elsewhere') pane.announce('Undo that in the template editor.');
  };

  return (
    <SurfaceLayer host={host}>
      {(layer) => (
        <>
          <GutterHandle
            store={store}
            layer={layer}
            glyphOf={(target) => (target.kind === 'item' ? 'grip' : 'menu')}
            labelOf={(target) => (target.kind === 'item' ? 'Drag to move · Click for options' : `Options for ${blockLabel(latest.current.template, target)}`)}
            onMenu={(target, handle) => open(target, { from: handle }, focusToReturn(handle))}
            onPress={(target, event) => press(target, event.currentTarget, event.nativeEvent)}
          />
          {hint && <div className="atlas-sb-drag-hint" role="note">{hint}</div>}
          <AnimatePresence>
            {pane.toast && <UndoToast key={pane.toast} text={pane.toast} onUndo={undo} onDismiss={() => setToast(null)} />}
          </AnimatePresence>
        </>
      )}
    </SurfaceLayer>
  );
}

/** A block's name, for its handle's label: "Options for Spells". */
function blockLabel(template: StatblockTemplate, target: HoverTarget): string {
  const block = findBlock(template.layout.blocks, target.blockId)?.block;
  return block ? blockName(block, template.fields) : 'this block';
}
