/** The collection the template editor works for. */

import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import type { CollectionChoice, CollectionContext } from '../collectionContext';

/**
 * The collection the editor works for (§7.1): the one it was opened for,
 * else the default collection. The header's chip switches it where there is
 * more than one.
 */
export function useEditorCollection(app: App | undefined, requested: string | null): CollectionContext | null {
  const [collections, setCollections] = useState<readonly CollectionChoice[] | null>(null);
  useEffect(() => {
    if (!app) return undefined;
    let current = true;
    AssetService.getInstance(app).getCollections().then(
      (list) => { if (current) setCollections(list.map(({ id, name }) => ({ id, name }))); },
      (error: unknown) => console.error('[Atlas] Reading the collections failed:', error),
    );
    return () => { current = false; };
  }, [app]);
  if (!app || !collections) return null;
  const known = requested !== null && collections.some((collection) => collection.id === requested);
  const collectionId = known ? requested : AssetService.getInstance(app).getDefaultCollectionId();
  return { collectionId, collections, linking: [], switchable: collections.length > 1 };
}
