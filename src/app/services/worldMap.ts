import type { App } from 'obsidian';
import { collectionFolderPath, GLOBAL_ASSETS_DIR } from './assetPaths';
import { AssetService, type Asset } from './AssetService';
import { coverCandidates, type CoverCandidate } from './collectionBundle/collectionCover';
import { sceneThumbnailPath } from './collectionBundle/collectionReferences';

/**
 * The artwork of a collection's maps and scenes that can be its world map, each image once.
 * A scene without artwork offers none: its thumbnail is a small picture Atlas makes anew.
 */
export async function worldMapCandidates(app: App, assets: readonly Asset[]): Promise<CoverCandidate[]> {
  const thumbnails = new Set(assets.flatMap((asset) => (asset.type === 'scene' && asset.data?.mapPath ? [sceneThumbnailPath(asset.data.mapPath)] : [])));
  return (await coverCandidates(app, assets)).filter((candidate) => !thumbnails.has(candidate.sourcePath));
}

/** Whether a vault path lies in Atlas's own folders for a collection: its folder, or the images its maps share. */
function inAtlasFolders(path: string, collectionId: string): boolean {
  if (path.split('/').some((part) => part === '..' || part === '.' || part === '')) return false;
  return path.startsWith(`${collectionFolderPath(collectionId)}/`) || path.startsWith(`${GLOBAL_ASSETS_DIR}/`);
}

/**
 * The image a collection shows as its world map, or null. Settings are no proof (a bundle, a sync
 * tool or a hand edit may have written them), nor is what a bundle's maps and scenes name as their
 * artwork, and this image is shown to others. So two things must hold: the image lies in Atlas's
 * own folders (the collection's, or the images maps share), never elsewhere in the vault, and it is
 * the artwork of one of the collection's own maps or scenes.
 */
export async function collectionWorldMap(app: App, collectionId: string): Promise<string | null> {
  const assets = AssetService.getInstance(app);
  const path = assets.getCollectionSettings(collectionId).worldMap;
  if (!path || !inAtlasFolders(path, collectionId)) return null;
  const candidates = await worldMapCandidates(app, await assets.getAssets(collectionId));
  return candidates.some((candidate) => candidate.sourcePath === path) ? path : null;
}
