import type { App } from 'obsidian';
import type { BundleFileRole } from './bundleFormat';

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
