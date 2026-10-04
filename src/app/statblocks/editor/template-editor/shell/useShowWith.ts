import { useMemo } from 'react';
import { TFile, type App } from 'obsidian';
import { newestFirst, showWithOf, type ShowWith, type ShowWithMode } from './showWith';

/** The statblocks of the template, the one changed last first, and what the editor shows the template with. */
export interface ShownWith {
  showWith: ShowWith;
  notes: readonly string[];
}

/**
 * Show with as the view's state asks (§2.3): the note it was opened from or
 * that was chosen, Sample or Empty as chosen, else the statblock of the
 * template changed last, else Sample.
 */
export function useShowWith(app: App | undefined, usageNotes: readonly string[], previewPath: string | null, mode: ShowWithMode | null): ShownWith {
  const notes = useMemo(() => {
    if (!app) return [...usageNotes];
    return newestFirst(usageNotes, (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? file.stat.mtime : null;
    });
  }, [app, usageNotes]);
  const showWith = useMemo(() => showWithOf(previewPath, mode, notes[0] ?? null), [previewPath, mode, notes]);
  return { showWith, notes };
}
