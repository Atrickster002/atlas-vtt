import type { AssetMetadata, CollectionMetadata } from './AssetService';
import { collectionFolderPath } from './assetPaths';
import { uniqueCollectionName } from './collectionNaming';
import { mapStrings } from '../utils/mapStrings';

/** `winter-camp` → `Winter Camp`: the display name of a collection known only by its folder. */
export function prettifyIdentifier(identifier: string): string {
  const words = identifier.replace(/[-_]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return identifier;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** `name`, or `name (2)`, `name (3)`, … while a collection other than `exceptId` uses it. */
export function numberedCollectionName(metadata: AssetMetadata | null, name: string, exceptId?: string): string {
  const taken = Object.values(metadata?.collections ?? {})
    .filter((collection) => collection.id !== exceptId)
    .map((collection) => collection.name);
  return uniqueCollectionName(name, taken);
}

/** A new record for a collection folder named `id`, named after the folder. */
export function createCollectionRecord(metadata: AssetMetadata | null, id: string, now = Date.now()): CollectionMetadata {
  const name = id === 'default' ? 'Default' : numberedCollectionName(metadata, prettifyIdentifier(id));
  return {
    id,
    uid: crypto.randomUUID(),
    version: 1,
    name,
    description: `${name} collection`,
    tags: {},
    settings: { conditions: [] },
    createdAt: now,
    modifiedAt: now,
  };
}

/**
 * Moves a collection record to the folder `newId`: the record keeps its uid and
 * settings, takes the folder name as display name, and every stored path into
 * the old folder follows. Moving the default collection starts an empty one.
 */
export function moveCollectionRecord(metadata: AssetMetadata, oldId: string, newId: string, now = Date.now()): void {
  const collection = metadata.collections[oldId];
  if (!collection) return;
  delete metadata.collections[oldId];
  metadata.collections[newId] = {
    ...collection,
    id: newId,
    name: numberedCollectionName(metadata, prettifyIdentifier(newId), oldId),
    modifiedAt: now,
  };

  const oldPrefix = `${collectionFolderPath(oldId)}/`;
  const newPrefix = `${collectionFolderPath(newId)}/`;
  const movePath = (text: string): string => (text.startsWith(oldPrefix) ? newPrefix + text.slice(oldPrefix.length) : text);
  for (const [id, asset] of Object.entries(metadata.assets)) {
    const moved = mapStrings(asset, movePath);
    metadata.assets[id] = asset.collection === oldId ? { ...moved, collection: newId } : moved;
  }

  if (oldId === 'default') metadata.collections.default = createCollectionRecord(metadata, 'default', now);
}

/**
 * Removes a collection and its assets from the index. Files outside its folder,
 * such as token images in the global assets folder, stay. Forgetting the
 * default collection starts an empty one.
 */
export function forgetCollection(metadata: AssetMetadata, id: string, now = Date.now()): void {
  for (const [assetId, asset] of Object.entries(metadata.assets)) {
    if (asset.collection === id) delete metadata.assets[assetId];
  }
  delete metadata.collections[id];
  if (id === 'default') metadata.collections.default = createCollectionRecord(metadata, 'default', now);
}
