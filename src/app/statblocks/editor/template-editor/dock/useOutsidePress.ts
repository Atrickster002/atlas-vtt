import { useEffect, useRef, type RefObject } from 'react';

/**
 * What a press outside a floating panel of the template editor still leaves
 * it open for (§2.6): the card (so a drag from Add lands and Structure stays
 * while selecting), the dock, and the menus and popovers the panel opened,
 * which portal out of it.
 */
export const KEEPS_PANELS_OPEN = [
  '.atlas-sb-pane-card',
  '.atlas-te-dock',
  '.atlas-te-floating',
  '[role="menu"]',
  '[role="listbox"]',
  '[data-radix-popper-content-wrapper]',
  '.atlas-ctx-menu',
  '.atlas-te-insert',
  '.modal-container',
].join(', ');

/**
 * Calls `onOutside` for a press anywhere in the panel's own document but in
 * the panel and the places `KEEPS_PANELS_OPEN` names; nothing while `active`
 * is false (a pinned panel).
 */
export function useOutsidePress(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void): void {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return undefined;
    const doc = element.doc;
    const onPointerDown = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (path.includes(element)) return;
      const target = path[0];
      const kept = target && typeof (target as Partial<Element>).closest === 'function'
        ? (target as Element).closest(KEEPS_PANELS_OPEN) !== null
        : false;
      if (!kept) latest.current();
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [ref, active]);
}
