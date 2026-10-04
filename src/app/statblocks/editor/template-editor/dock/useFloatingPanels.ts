import { useCallback, useState } from 'react';
import type { App } from 'obsidian';
import { dockPanelFit, dockYieldsToSettings, type EditorWidth } from './dockPlacement';
import { loadDockPrefs, saveDockPrefs, type DockPanelId, type DockPrefs } from './dockPrefs';

export interface SettingsState {
  open: boolean;
  pinned: boolean;
}

/** The template editor's floating panels (§2.5–2.8): which dock panel is open, the Settings panel, and how they share the room. */
export interface FloatingPanels {
  dock: DockPrefs;
  settings: SettingsState;
  /** Opens a dock panel, or closes it when it is the one open. */
  toggleDock: (id: DockPanelId) => void;
  openDock: (id: DockPanelId) => void;
  closeDock: () => void;
  pinDock: (pinned: boolean) => void;
  /** The dock panel folds to its header while Settings needs its room. */
  dockCollapsed: boolean;
  /** Hidden while Settings is open: an unpinned dock panel whose room the view lost meanwhile. */
  dockHidden: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  pinSettings: (pinned: boolean) => void;
  /** A block was inserted: the first session's pinned Add panel lets go. */
  inserted: () => void;
  /** Escape's turn in the ladder (§11.1): closes the unpinned dock panel, else Settings; false when neither was open. */
  escape: () => boolean;
}

/**
 * The floating panels' state (§2.6–2.7): the dock panel as this device left
 * it, Settings opened on demand, and the yield rule between them: in a
 * medium view, or a wide one whose note column cannot hold both, the dock
 * panel gives way to Settings (closed, or folded to its header when pinned).
 */
export function useFloatingPanels(app: App | undefined, width: EditorWidth, noteColumn: number): FloatingPanels {
  const [dock, setDock] = useState<DockPrefs>(() => loadDockPrefs(app));
  const [settings, setSettings] = useState<SettingsState>({ open: false, pinned: false });

  const storeDock = useCallback((next: DockPrefs): void => {
    setDock(next);
    saveDockPrefs(app, next);
  }, [app]);

  const fit = dockPanelFit(noteColumn, width);
  const yields = settings.open && dock.open !== null && dockYieldsToSettings(noteColumn, width, fit.width);
  const openSettings = (): void => {
    // An unpinned dock panel without room beside Settings closes; a pinned one folds while Settings is open.
    if (dock.open !== null && !dock.pinned && dockYieldsToSettings(noteColumn, width, fit.width)) storeDock({ ...dock, open: null, firstRun: false });
    setSettings((was) => ({ ...was, open: true }));
  };
  const closeSettings = useCallback((): void => setSettings((was) => ({ ...was, open: false })), []);

  const openDock = (id: DockPanelId): void => {
    // In a medium view one panel at a time: a dock panel puts an unpinned Settings away.
    if (width !== 'wide' && settings.open && !settings.pinned) closeSettings();
    storeDock({ ...dock, open: id });
  };

  return {
    dock,
    settings,
    toggleDock: (id) => {
      if (dock.open === id && !(yields && dock.pinned)) storeDock({ ...dock, open: null, firstRun: false });
      else openDock(id);
    },
    openDock,
    closeDock: () => storeDock({ ...dock, open: null, firstRun: false }),
    pinDock: (pinned) => storeDock({ ...dock, pinned, firstRun: false }),
    dockCollapsed: yields && dock.pinned,
    dockHidden: yields && !dock.pinned,
    openSettings,
    closeSettings,
    pinSettings: (pinned) => setSettings((was) => ({ ...was, pinned })),
    inserted: () => {
      if (dock.firstRun) storeDock({ ...dock, pinned: false, firstRun: false });
    },
    escape: () => {
      if (dock.open !== null && !dock.pinned && !yields) {
        storeDock({ ...dock, open: null, firstRun: false });
        return true;
      }
      if (settings.open) {
        closeSettings();
        return true;
      }
      return false;
    },
  };
}
