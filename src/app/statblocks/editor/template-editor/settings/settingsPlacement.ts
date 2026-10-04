/**
 * Where the Settings panel stands (§2.7): over the note column, its right
 * edge `PANEL_GAP` left of the card, its top level with the selected block's,
 * kept inside the view. In a stacked view it stands as a sheet at the view's
 * foot, at most half its height, so the card stays in sight above it.
 * Pure; boxes are in the editor's own coordinates.
 */

import { PANEL_GAP, SETTINGS_WIDTH, type EditorWidth } from '../dock/dockPlacement';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SettingsPlacementInput {
  /** The editor's box: what the panel is kept inside. */
  view: Rect;
  /** The card's box. */
  card: Rect;
  /** The selected block's box; null with nothing selected (the template's settings). */
  block: Rect | null;
  /** The panel's height as drawn. */
  height: number;
  /** Where the dock ends on the left, so the panel never covers it. */
  dockRight: number;
  width: EditorWidth;
}

export interface SettingsPlacement {
  left: number;
  top: number;
  /** The tallest the panel may be before it scrolls inside. */
  maxHeight: number;
}

export function placeSettings({ view, card, block, height, dockRight, width }: SettingsPlacementInput): SettingsPlacement {
  const maxHeight = Math.max(0, view.bottom - view.top - 2 * PANEL_GAP);
  const drawn = Math.min(height, maxHeight);
  const clampTop = (top: number): number => Math.max(view.top + PANEL_GAP, Math.min(top, view.bottom - PANEL_GAP - drawn));
  if (width === 'stacked') {
    const half = Math.max(0, (view.bottom - view.top) / 2 - PANEL_GAP);
    const left = Math.max(view.left + PANEL_GAP, Math.min((block ?? card).left, view.right - PANEL_GAP - SETTINGS_WIDTH));
    return { left, top: view.bottom - PANEL_GAP - Math.min(height, half), maxHeight: half };
  }
  const left = Math.max(dockRight + PANEL_GAP, view.left + PANEL_GAP, card.left - PANEL_GAP - SETTINGS_WIDTH);
  return { left, top: clampTop((block ?? card).top), maxHeight };
}
