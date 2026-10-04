/**
 * What the template editor shows its template with (§2.3, "Show with"): the
 * sample values, the prompts a new statblock shows (Empty), or a statblock
 * that uses the template. Pure, so the default rule is tested alone.
 */

/** Sample and Empty are chosen by name; a statblock by its note's path. */
export type ShowWithMode = 'sample' | 'empty';

export type ShowWith =
  | { kind: 'sample' }
  | { kind: 'empty' }
  | { kind: 'note'; path: string };

export const SHOW_SAMPLE: ShowWith = { kind: 'sample' };
export const SHOW_EMPTY: ShowWith = { kind: 'empty' };

/**
 * What the view's saved state asks for: a statblock it was opened from or
 * chose, Sample or Empty as chosen, or, when nothing was chosen, the
 * statblock of the template changed last (`newest`), else Sample.
 */
export function showWithOf(previewPath: string | null, mode: ShowWithMode | null, newest: string | null): ShowWith {
  if (previewPath) return { kind: 'note', path: previewPath };
  if (mode === 'empty') return SHOW_EMPTY;
  if (mode === 'sample' || !newest) return SHOW_SAMPLE;
  return { kind: 'note', path: newest };
}

/** The view state a choice is saved as. */
export function showWithState(choice: ShowWith): { previewPath: string | null; previewMode: ShowWithMode | null } {
  return choice.kind === 'note'
    ? { previewPath: choice.path, previewMode: null }
    : { previewPath: null, previewMode: choice.kind };
}

/** The statblocks of a template, the one changed last first; `mtimeOf` is null for a note the vault does not hold. */
export function newestFirst(paths: readonly string[], mtimeOf: (path: string) => number | null): string[] {
  return paths
    .map((path) => ({ path, mtime: mtimeOf(path) }))
    .filter((entry): entry is { path: string; mtime: number } => entry.mtime !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.path);
}

export function sameShowWith(a: ShowWith, b: ShowWith): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'note' || (b.kind === 'note' && a.path === b.path);
}
