/**
 * Where the template editor's floating panels go (§2.5–2.8): the dock at the
 * note column's left edge, a dock panel beside it, the Settings panel beside
 * the card. They float over the note column and never over the card while the
 * view is wide enough. Pure: the editor measures, this decides.
 */

/** Below this view width the dock panel and Settings are one at a time. */
export const WIDE_EDITOR_FROM = 900;
/** Below this view width the card stands above the note, as in a note view (`STACK_BELOW`). */
export const STACKED_BELOW = 720;
/** The dock with its margin, a dock panel, a narrowed dock panel, the Settings panel, and the gap between them. */
export const DOCK_SPAN = 48;
export const DOCK_PANEL_WIDTH = 280;
export const DOCK_PANEL_NARROW_WIDTH = 240;
export const SETTINGS_WIDTH = 300;
export const PANEL_GAP = 8;
/** A stacked view's panels open under the capsule, at most this wide. */
export const POPOVER_MAX_WIDTH = 320;

export type EditorWidth = 'wide' | 'medium' | 'stacked';

export function editorWidthOf(viewWidth: number): EditorWidth {
  if (viewWidth > 0 && viewWidth < STACKED_BELOW) return 'stacked';
  return viewWidth > 0 && viewWidth < WIDE_EDITOR_FROM ? 'medium' : 'wide';
}

/** How a dock panel opens in a note column this wide: beside the dock at full or narrowed width, else as a popover. */
export type DockPanelFit = { kind: 'beside'; width: number } | { kind: 'popover'; width: number };

export function dockPanelFit(noteColumn: number, width: EditorWidth): DockPanelFit {
  if (noteColumn <= 0) return { kind: 'beside', width: DOCK_PANEL_WIDTH };
  if (width === 'stacked') return { kind: 'popover', width: Math.min(POPOVER_MAX_WIDTH, Math.max(0, noteColumn - 2 * PANEL_GAP)) };
  if (DOCK_SPAN + DOCK_PANEL_WIDTH + 2 * PANEL_GAP <= noteColumn) return { kind: 'beside', width: DOCK_PANEL_WIDTH };
  if (DOCK_SPAN + DOCK_PANEL_NARROW_WIDTH + 2 * PANEL_GAP <= noteColumn) return { kind: 'beside', width: DOCK_PANEL_NARROW_WIDTH };
  return { kind: 'popover', width: DOCK_PANEL_NARROW_WIDTH };
}

/**
 * Whether an open dock panel gives way while Settings is open: in a medium
 * view always (one at a time), in a wide one when the note column cannot
 * hold the dock, the panel and Settings side by side. A column not measured
 * yet (0) makes nothing give way.
 */
export function dockYieldsToSettings(noteColumn: number, width: EditorWidth, dockPanelWidth: number = DOCK_PANEL_WIDTH): boolean {
  // Not measured yet (0): nothing gives way.
  if (noteColumn <= 0) return false;
  if (width !== 'wide') return true;
  return DOCK_SPAN + dockPanelWidth + SETTINGS_WIDTH + 3 * PANEL_GAP > noteColumn;
}
