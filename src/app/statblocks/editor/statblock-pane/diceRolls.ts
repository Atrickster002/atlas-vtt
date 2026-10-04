import type { RollChoice } from './paneMenus';

/** The dice expressions drawn in an element, each rolled as its link rolls when clicked (at most six). */
export function rollsIn(element: HTMLElement): RollChoice[] {
  return [...element.querySelectorAll<HTMLElement>('.atlas-dice-link')].slice(0, 6).flatMap((link) => {
    const label = link.textContent?.trim() ?? '';
    return label ? [{ label, run: () => link.click() }] : [];
  });
}
