import { useEffect, useState } from 'react';
import type { App, EventRef } from 'obsidian';
import { linkedStatblockPaths } from '../../../creatures/creatureFacts';
import { AssetService } from '../../../services/AssetService';
import { layoutsOfNotes, type LayoutNotes } from '../../fs/fsLayoutNotes';

/** Notes change often while typing, and a batch changes hundreds: the list follows once the metadata settles. */
const SETTLE_MS = 500;

function sameGroups(a: readonly LayoutNotes[], b: readonly LayoutNotes[]): boolean {
  return a.length === b.length && a.every((group, index) => {
    const other = b[index];
    return other !== undefined && other.layout.id === group.layout.id && other.layout.name === group.layout.name
      && other.notes.length === group.notes.length && other.notes.every((path, at) => path === group.notes[at]);
  });
}

/**
 * The Fantasy Statblocks layouts that draw the frontmatter statblocks the
 * collection's tokens link, each with its notes; null while the tokens are
 * read. Follows the metadata cache, so adopted notes leave the list.
 */
export function useCollectionLayouts(app: App, collectionId: string): readonly LayoutNotes[] | null {
  const [groups, setGroups] = useState<readonly LayoutNotes[] | null>(null);
  useEffect(() => {
    let paths: string[] | null = null;
    let current = true;
    let timer = 0;
    const read = (): void => {
      if (!current || paths === null) return;
      const next = layoutsOfNotes(app, paths);
      setGroups((previous) => (previous && sameGroups(previous, next) ? previous : next));
    };
    setGroups(null);
    AssetService.getInstance(app).getAssets(collectionId, 'token').then(
      (tokens) => {
        paths = linkedStatblockPaths(tokens.flatMap((asset) => (asset.type === 'token' ? [asset] : [])));
        read();
      },
      (error: unknown) => {
        console.error('[Atlas] Listing the collection\'s statblocks failed:', error);
        paths = [];
        read();
      },
    );
    const later = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, SETTLE_MS);
    };
    const refs: EventRef[] = [app.metadataCache.on('changed', later), app.metadataCache.on('deleted', later)];
    return () => {
      current = false;
      window.clearTimeout(timer);
      refs.forEach((ref) => app.metadataCache.offref(ref));
    };
  }, [app, collectionId]);
  return groups;
}
