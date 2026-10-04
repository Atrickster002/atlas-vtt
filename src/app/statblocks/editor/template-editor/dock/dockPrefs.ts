/**
 * The template editor's dock as this device left it (§2.6): which panel was
 * open and whether it was pinned. Stored with `app.saveLocalStorage` beside
 * the statblock panel's width (`panelPrefs.ts`), per vault and device.
 */

import type { App } from 'obsidian';

export type DockPanelId = 'add' | 'structure' | 'properties' | 'template';

export const DOCK_PANEL_IDS: readonly DockPanelId[] = ['add', 'structure', 'properties', 'template'];

export interface DockPrefs {
  open: DockPanelId | null;
  pinned: boolean;
  /**
   * The first session on this device: Add opens pinned, so a new user sees
   * where blocks come from, and unpins after the first block it inserts.
   */
  firstRun: boolean;
}

const STORAGE_KEY = 'atlas-vtt-template-dock';

/** A first session: Add, pinned. */
export const FIRST_RUN_DOCK: DockPrefs = { open: 'add', pinned: true, firstRun: true };
/** Without an app (a test): everything put away. */
export const CLOSED_DOCK: DockPrefs = { open: null, pinned: false, firstRun: false };

const isPanel = (value: unknown): value is DockPanelId => typeof value === 'string' && (DOCK_PANEL_IDS as readonly string[]).includes(value);

export function loadDockPrefs(app: App | undefined): DockPrefs {
  if (!app) return CLOSED_DOCK;
  const stored: unknown = app.loadLocalStorage(STORAGE_KEY);
  if (stored === null || typeof stored !== 'object') return FIRST_RUN_DOCK;
  const { open, pinned } = stored as Record<string, unknown>;
  return { open: isPanel(open) ? open : null, pinned: pinned === true, firstRun: false };
}

export function saveDockPrefs(app: App | undefined, prefs: DockPrefs): void {
  app?.saveLocalStorage(STORAGE_KEY, { open: prefs.open, pinned: prefs.pinned });
}
