import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** How long after a key in the outline the canvas may not take focus for the block it selects. */
const KEEP_MS = 150;

/**
 * Keeps focus in the Outline when a key pressed there runs one of the
 * editor's block commands: those select a block and focus it in the canvas,
 * and this hands focus straight back to the block's row (or the tree's tab
 * stop where none is selected). Call the returned function as such a key goes
 * on to the editor; a press of the pointer anywhere lets the canvas have focus again.
 */
export function useFocusKeptInOutline(
  wrapperRef: RefObject<HTMLElement | null>, rowSelector: (id: string) => string,
): () => void {
  const until = useRef(0);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const editor = wrapper?.closest('.atlas-te');
    if (!wrapper || !editor) return undefined;
    const doc = wrapper.doc;
    const onFocusIn = (event: FocusEvent): void => {
      // Only focus the command took from the outline comes back: from a row, or from nowhere once it removed the row.
      const from = event.relatedTarget as Node | null;
      const fromOutline = from === null || from === doc.body || !from.isConnected || wrapper.contains(from);
      if (Date.now() > until.current || !fromOutline) return;
      const target = event.target as Partial<Element> | null;
      if (typeof target?.closest !== 'function') return;
      const stage = target.closest('.atlas-te-stage');
      if (!stage || !editor.contains(stage)) return;
      const id = target.closest('[data-block-id]')?.getAttribute('data-block-id');
      const row = (id ? wrapper.querySelector<HTMLElement>(rowSelector(id)) : null)
        ?? wrapper.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
      if (!row) return;
      until.current = 0;
      row.focus({ preventScroll: true });
    };
    const onPointerDown = (): void => { until.current = 0; };
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      doc.removeEventListener('focusin', onFocusIn, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [wrapperRef, rowSelector]);

  return useCallback(() => { until.current = Date.now() + KEEP_MS; }, []);
}
