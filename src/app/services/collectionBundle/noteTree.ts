import type { BundleFile } from './bundleFormat';
import { baseName } from '../../utils/pathUtils';

/** Why a note is part of the collection: a scene opens it, or another note links to it. `more` counts the others that do. */
export interface NoteOrigin {
  kind: 'scene' | 'note';
  name: string;
  more: number;
}

export interface NoteEntry {
  path: string;
  name: string;
  /** 0 for a note a scene opens, one more for every link followed to reach the note. */
  depth: number;
  origin?: NoteOrigin;
  /** How many notes were found through this one. */
  linked?: number;
}

export const noteName = (path: string): string => baseName(path).replace(/\.md$/i, '');
const byName = (a: BundleFile, b: BundleFile): number => noteName(a.vaultPath).localeCompare(noteName(b.vaultPath), undefined, { numeric: true });

/**
 * The bundled notes as a tree in reading order: the notes scenes open, each
 * followed by the notes found through it. A note several notes link to stands
 * once, below the one nearest to a scene.
 */
export function noteTree(files: readonly BundleFile[], assetNames: ReadonlyMap<string, string>): NoteEntry[] {
  const notes = files.filter((file) => file.role === 'linked-note');
  const bundled = new Set(notes.map((note) => note.vaultPath));
  const linkers = (note: BundleFile): string[] => (note.linkedFrom ?? []).filter((path) => bundled.has(path));
  const scenes = (note: BundleFile): string[] => (note.owners ?? []).flatMap((id) => assetNames.get(id) ?? []);
  const linkedBy = new Map<string, BundleFile[]>();
  for (const note of notes) {
    for (const path of linkers(note)) linkedBy.set(path, [...(linkedBy.get(path) ?? []), note]);
  }

  const roots = notes.filter((note) => scenes(note).length > 0 || linkers(note).length === 0);
  const placed = new Set(roots.map((root) => root.vaultPath));
  const children = new Map<string, BundleFile[]>();
  // Level by level, so every note hangs below the shortest way to it.
  const queue = [...roots];
  for (const note of queue) {
    for (const child of linkedBy.get(note.vaultPath) ?? []) {
      if (placed.has(child.vaultPath)) continue;
      placed.add(child.vaultPath);
      children.set(note.vaultPath, [...(children.get(note.vaultPath) ?? []), child]);
      queue.push(child);
    }
  }
  // Notes that only link to each other (a damaged bundle) are listed on their own.
  const unreached = notes.filter((note) => !placed.has(note.vaultPath));

  const entries: NoteEntry[] = [];
  /** Lists `note` and the notes below it, and returns how many those are. */
  const list = (note: BundleFile, depth: number, parent?: BundleFile): number => {
    const sceneNames = scenes(note);
    const entry: NoteEntry = { path: note.vaultPath, name: noteName(note.vaultPath), depth };
    if (parent) entry.origin = { kind: 'note', name: noteName(parent.vaultPath), more: linkers(note).length - 1 };
    else if (sceneNames[0]) entry.origin = { kind: 'scene', name: sceneNames[0], more: sceneNames.length - 1 };
    entries.push(entry);
    let below = 0;
    for (const child of (children.get(note.vaultPath) ?? []).sort(byName)) below += 1 + list(child, depth + 1, note);
    if (below > 0) entry.linked = below;
    return below;
  };
  for (const root of [...roots, ...unreached].sort(byName)) list(root, 0);
  return entries;
}
