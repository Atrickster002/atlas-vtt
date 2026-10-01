import type { App } from 'obsidian';
import type { BundleFile, BundleFileRole } from './bundleFormat';

/** Audio and video stay behind, like a collection's music: they would make a bundle too large to pass on. */
const ATTACHMENT = /\.(png|jpe?g|webp|gif|avif|bmp|svg|pdf)$/i;

export interface LinkedFile {
  path: string;
  role: Extract<BundleFileRole, 'linked-note' | 'note-attachment'>;
}

/**
 * The notes `notePath` links to and the images and PDFs it shows, as Obsidian
 * resolved them. A link to a file that is gone resolves to nothing, so it is not listed.
 */
export function linkedFiles(app: App, notePath: string): LinkedFile[] {
  const targets = Object.keys(app.metadataCache.resolvedLinks[notePath] ?? {});
  return targets.flatMap((path): LinkedFile[] => {
    if (path === notePath) return [];
    if (path.toLowerCase().endsWith('.md')) return [{ path, role: 'linked-note' }];
    return ATTACHMENT.test(path) ? [{ path, role: 'note-attachment' }] : [];
  });
}

/**
 * `files` with everything their notes lead to: the notes that pins and
 * characters open are read for links, then the notes found that way, until
 * none is new. Each file reached lists the notes that link to it. Statblock
 * notes are not read: their links lead into rulebooks. Only an export needs
 * this; inside a vault a link finds its note wherever a move or copy left it.
 */
export function withLinkedFiles(app: App, files: readonly BundleFile[]): BundleFile[] {
  const known = new Map(files.map((file): [string, BundleFile] => [file.vaultPath, { ...file, ...(file.linkedFrom && { linkedFrom: [...file.linkedFrom] }) }]));
  const notes = files.filter((file) => file.role === 'linked-note').map((file) => file.vaultPath);
  // Notes found on the way join the list, so the walk goes level by level and ends once every note was read.
  for (const note of notes) {
    for (const { path, role } of linkedFiles(app, note)) {
      const file = known.get(path);
      if (file) {
        (file.linkedFrom ??= []).push(note);
        continue;
      }
      known.set(path, { vaultPath: path, role, linkedFrom: [note] });
      if (role === 'linked-note') notes.push(path);
    }
  }
  return [...known.values()];
}
