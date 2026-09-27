import type { AssetMetadata, TokenAsset } from '../AssetService';
import { GLOBAL_ASSETS_DIR } from '../assetPaths';
import { defaultCollectionIdOf } from '../collectionRecords';
import { groupTokenRefs } from './assetFiles';
import { recoveredId, recoveredTokenName } from './recoveredIds';

const COLLECTION_TOKEN = /^atlas-vtt\/collections\/([^/]+)\/(?:.+\/)?tokens\/.+$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const GROUP_THUMBNAILS = [`${GLOBAL_ASSETS_DIR}/encounter-thumbnails/`, `${GLOBAL_ASSETS_DIR}/player-thumbnails/`];

/** Token art used by encounters and player groups, with the collection of the first group that uses it. */
function groupArtwork(metadata: AssetMetadata): Map<string, string> {
  const art = new Map<string, string>();
  for (const asset of Object.values(metadata.assets)) {
    if (asset.type !== 'encounter' && asset.type !== 'player') continue;
    for (const token of groupTokenRefs(asset)) {
      if (typeof token?.imagePath === 'string' && token.imagePath) art.set(token.imagePath, asset.collection || defaultCollectionIdOf(metadata));
    }
  }
  return art;
}

/**
 * Removes records earlier recoveries made from images that are no token
 * (encounter thumbnails, stray global images) and names recovered tokens after
 * their file without Atlas's suffix. Returns whether anything changed.
 */
export function tidyRecoveredTokens(metadata: AssetMetadata, now: number): boolean {
  const groupArt = groupArtwork(metadata);
  let changed = false;
  for (const [id, asset] of Object.entries(metadata.assets)) {
    if (asset.type !== 'token' || !asset.imagePath) continue;
    const recovered = id.startsWith('token-recovered-');
    const isGroupThumbnail = GROUP_THUMBNAILS.some((prefix) => asset.imagePath.startsWith(prefix));
    if (isGroupThumbnail || (recovered && !COLLECTION_TOKEN.test(asset.imagePath) && !groupArt.has(asset.imagePath))) {
      delete metadata.assets[id];
      changed = true;
      continue;
    }
    const name = recovered ? recoveredTokenName(asset.imagePath) : asset.name;
    if (name && name !== asset.name) {
      asset.name = name;
      asset.modifiedAt = now;
      changed = true;
    }
  }
  return changed;
}

/**
 * Takes token art without a record into the index: images in a collection's
 * tokens folder, and images encounters or player groups use. `owned` holds the
 * paths records already own and grows with every adopted image.
 */
export function adoptTokenArtwork(metadata: AssetMetadata, files: ReadonlySet<string>, owned: Set<string>, now: number): boolean {
  const groupArt = groupArtwork(metadata);
  let changed = false;
  for (const path of [...files].sort()) {
    if (!IMAGE.test(path) || owned.has(path)) continue;
    const collection = COLLECTION_TOKEN.exec(path)?.[1] ?? groupArt.get(path);
    const id = recoveredId('token', path);
    if (!collection || metadata.assets[id]) continue;

    const token: TokenAsset = {
      id,
      type: 'token',
      name: recoveredTokenName(path),
      imagePath: path,
      tags: [],
      collection,
      createdAt: now,
      modifiedAt: now,
    };
    metadata.assets[id] = token;
    owned.add(path);
    changed = true;
  }
  return changed;
}
