import { useEffect } from 'react';

/** Where scroll positions are kept, by pane. */
export interface ScrollMemory {
  scrollTopOf(key: string): number;
  setScrollTop(key: string, top: number): void;
}

/** How long a pane waits for its content to grow tall enough to scroll back. */
const RESTORE_TIMEOUT_MS = 1500;
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Remembers how far a pane was scrolled and scrolls a pane showing the same
 * place back there. Assets load after the pane mounts, so the restore retries
 * each frame until the content is tall enough, the time is up or the user
 * scrolls; until then the pane's own scrolling is not recorded.
 */
export function useRememberedScroll(scrollElement: HTMLElement | null, key: string, memory: ScrollMemory): void {
  useEffect(() => {
    if (!scrollElement) return;
    let target = memory.scrollTopOf(key);
    let frame = 0;
    const deadline = performance.now() + RESTORE_TIMEOUT_MS;

    const stopRestoring = (): void => {
      target = 0;
      window.cancelAnimationFrame(frame);
    };
    const restore = (): void => {
      if (target <= 0) return;
      const reachable = scrollElement.scrollHeight - scrollElement.clientHeight;
      scrollElement.scrollTop = Math.min(target, reachable);
      if (reachable >= target || performance.now() > deadline) stopRestoring();
      else frame = window.requestAnimationFrame(restore);
    };
    const record = (): void => {
      if (target <= 0) memory.setScrollTop(key, scrollElement.scrollTop);
    };

    restore();
    scrollElement.addEventListener('scroll', record, { passive: true });
    for (const type of USER_SCROLL_EVENTS) scrollElement.addEventListener(type, stopRestoring, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement.removeEventListener('scroll', record);
      for (const type of USER_SCROLL_EVENTS) scrollElement.removeEventListener(type, stopRestoring);
    };
  }, [scrollElement, key, memory]);
}
