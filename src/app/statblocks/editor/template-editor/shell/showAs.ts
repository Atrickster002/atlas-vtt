/**
 * "Show as" (§2.3): the card at the width of another surface it is shown on,
 * so the template can be checked there without leaving the editor. Note is
 * the panel's own width; the others come from `statblockSurfaceWidths.ts`.
 */

import {
  STATBLOCK_FEED_MAX_WIDTH, STATBLOCK_PREVIEW_MAX_WIDTH, STATBLOCK_PREVIEW_WIDE_FROM, STATBLOCK_PREVIEW_WIDE_MAX_WIDTH,
} from '../../../render/statblockSurfaceWidths';

export type ShowAs = 'note' | 'hover' | 'dm-screen';

export interface ShowAsChoice {
  value: ShowAs;
  label: string;
}

/** The hover card's width in a window this wide. */
export function hoverCardWidth(windowWidth: number): number {
  return windowWidth >= STATBLOCK_PREVIEW_WIDE_FROM ? STATBLOCK_PREVIEW_WIDE_MAX_WIDTH : STATBLOCK_PREVIEW_MAX_WIDTH;
}

/** The card's width for a choice; undefined for the note's own (the panel's width). */
export function showAsWidth(choice: ShowAs, windowWidth: number): number | undefined {
  if (choice === 'hover') return hoverCardWidth(windowWidth);
  if (choice === 'dm-screen') return STATBLOCK_FEED_MAX_WIDTH;
  return undefined;
}

/** The choices in this window: where a hover card is as wide as the DM screen's column, the two are one. */
export function showAsChoices(windowWidth: number): ShowAsChoice[] {
  const same = hoverCardWidth(windowWidth) === STATBLOCK_FEED_MAX_WIDTH;
  return [
    { value: 'note', label: 'Note' },
    ...(same
      ? [{ value: 'hover' as const, label: 'Hover card and DM screen' }]
      : [{ value: 'hover' as const, label: 'Hover card' }, { value: 'dm-screen' as const, label: 'DM screen' }]),
  ];
}

/** The footer's line while the card is not at the note's width. */
export function showAsLine(choice: ShowAs, windowWidth: number): string | null {
  if (choice === 'note') return null;
  if (choice === 'dm-screen') return 'Shown as on the DM screen';
  return hoverCardWidth(windowWidth) === STATBLOCK_FEED_MAX_WIDTH ? 'Shown as a hover card and on the DM screen' : 'Shown as a hover card';
}
