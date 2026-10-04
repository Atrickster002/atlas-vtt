import { useCallback, useRef } from 'react';
import type { StatblockTemplate } from '../../model/templateTypes';
import { entryItemKeys } from '../../values/entryKeys';
import { scrollerOf } from '../dnd/autoScroll';
import { droppedIndex } from '../dnd/listDragGeometry';
import { useListDrag } from '../dnd/useListDrag';
import { ITEM_SELECTOR } from '../interaction/useSurfaceHover';
import type { HoverTarget } from '../interaction/hoverStore';
import { entryList } from './entryPatches';
import { findEntry } from './paneEntryActions';
import type { PaneEditController } from './paneEditContext';

/** The clamp's hint is said once per session: a second pull against the list's edge is no surprise. */
let pullHintSaid = false;

export interface PaneItemDragInput {
  pane: PaneEditController;
  template: StatblockTemplate;
  /** Shows the clamp's hint by the list (§7.2). */
  hint: (text: string) => void;
}

/**
 * Dragging an ability by its handle (spec §7.2), at rest and while an ability
 * of the list is being typed: held in its own list, dropped as one move
 * patch by the ability's identity, or through the open list editor, which
 * takes the text being typed along.
 */
export function usePaneItemDrag({ pane, template, hint }: PaneItemDragInput): (target: HoverTarget, handle: HTMLElement, event: PointerEvent) => void {
  const drag = useListDrag();
  const latest = useRef({ pane, template, hint });
  latest.current = { pane, template, hint };

  return useCallback((target: HoverTarget, handle: HTMLElement, event: PointerEvent): void => {
    const frame = target.element.closest<HTMLElement>('[data-block-id]');
    const { pane: current, template: shown } = latest.current;
    const found = target.itemKey ? findEntry(shown, current, { blockId: target.blockId, itemKey: target.itemKey }) : null;
    if (!frame || !found || !target.itemKey) return;
    const items = (): HTMLElement[] => [...frame.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    const keys = (): string[] => items().map((item) => item.getAttribute('data-item-key') ?? '');
    const list = frame.querySelector('.atlas-sb-heading')?.textContent?.trim() || found.field.label;
    const from = (): number => keys().indexOf(target.itemKey ?? '');
    drag.press({
      items,
      itemKey: target.itemKey,
      scroller: scrollerOf(frame),
      onStart: () => current.announce(`Picked up ${found.name}, ${from() + 1} of ${keys().length} in ${list}.`),
      onGap: (gap, count) => {
        if (gap !== null) current.announce(`${found.name}, ${droppedIndex(from(), gap) + 1} of ${count}.`);
      },
      onPull: () => {
        if (pullHintSaid) return;
        pullHintSaid = true;
        const text = `Abilities stay in their list. To move ${found.name} to another list, use its menu: Move to.`;
        latest.current.hint(text);
        current.announce(text);
      },
      onDrop: (fromAt, gap) => {
        const drawn = keys();
        const toAt = droppedIndex(fromAt, gap);
        const stored = entryItemKeys(entryList(latest.current.pane.read(found.field).value));
        const fromIndex = stored.indexOf(drawn[fromAt] ?? '');
        const toIndex = stored.indexOf(drawn[toAt] ?? '');
        if (fromIndex < 0 || toIndex < 0) return;
        latest.current.pane.moveEntry(found.field, fromIndex, toIndex);
        latest.current.pane.announce(`Dropped ${found.name} at ${toAt + 1} of ${drawn.length}.`);
      },
      onCancel: (started) => {
        if (started) latest.current.pane.announce('Not moved.');
      },
    }, handle, event);
  }, [drag]);
}
