import type { AssetMetadata } from './AssetService';
import { collectionFolderName } from './assetPaths';
import { collectionNameKey } from './collectionNaming';

/** How a collection whose name differs from its folder gets both to match. */
export type FolderNameFix =
  | { kind: 'rename-folder'; id: string; folder: string }
  | { kind: 'take-folder-name'; id: string };

/**
 * A collection is named like its folder. For every collection whose name
 * differs, the folder takes the name, unless another collection or folder
 * already has it or its folder is missing; then the name takes the folder's.
 * `folders` lists the folders in the collections folder.
 */
export function planFolderNameFixes(metadata: AssetMetadata, folders: readonly string[]): FolderNameFix[] {
  const takenKeys = new Set([...folders, ...Object.keys(metadata.collections)].map(collectionNameKey));
  const fixes: FolderNameFix[] = [];
  for (const collection of Object.values(metadata.collections)) {
    if (collection.name === collection.id) continue;
    const folder = collectionFolderName(collection.name);
    const ownFolder = folders.includes(collection.id);
    const sameKey = collectionNameKey(folder) === collectionNameKey(collection.id);
    if (!ownFolder || folder === collection.id || (!sameKey && takenKeys.has(collectionNameKey(folder)))) {
      fixes.push({ kind: 'take-folder-name', id: collection.id });
      continue;
    }
    takenKeys.add(collectionNameKey(folder));
    fixes.push({ kind: 'rename-folder', id: collection.id, folder });
  }
  return fixes;
}
