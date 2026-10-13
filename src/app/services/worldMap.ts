import type { App } from 'obsidian';
import type { CampaignService } from '../campaigns/CampaignService';
import { collectionFolderPath, GLOBAL_ASSETS_DIR } from './assetPaths';
import { AssetService, type Asset } from './AssetService';
import { coverCandidates } from './collectionBundle/collectionCover';
import { sceneThumbnailPath } from './collectionBundle/collectionReferences';

/**
 * The artwork of a map or scene that can be a world map: the map's image, or the background a
 * scene's file shows. A scene without one has none: its thumbnail is a small picture Atlas makes anew.
 */
export async function worldMapArtwork(app: App, asset: Asset): Promise<string | null> {
  const thumbnail = asset.type === 'scene' && asset.data?.mapPath ? sceneThumbnailPath(asset.data.mapPath) : null;
  const [candidate] = await coverCandidates(app, [asset]);
  return candidate === undefined || candidate.sourcePath === thumbnail ? null : candidate.sourcePath;
}

/** Whether a vault path lies in Atlas's own folders for a collection: its folder, or the images its maps share. */
export function inAtlasFolders(path: string, collectionId: string): boolean {
  if (path.split('/').some((part) => part === '..' || part === '.' || part === '')) return false;
  return path.startsWith(`${collectionFolderPath(collectionId)}/`) || path.startsWith(`${GLOBAL_ASSETS_DIR}/`);
}

/**
 * The image a campaign shows as its world map, or null. Campaign files are no proof (a sync tool or
 * a hand edit may have written them), nor is what a bundle's maps and scenes name as their artwork,
 * and this image is shown to others. So the campaign's world map must be a map or scene of Atlas's
 * asset index, the image must be its artwork, and that image must lie in Atlas's own folders (the
 * asset's collection, or the images maps share), never elsewhere in the vault.
 */
export async function campaignWorldMap(app: App, campaigns: CampaignService, campaignId: string | null): Promise<string | null> {
  const assetId = campaignId === null ? undefined : campaigns.get(campaignId)?.worldMap;
  if (assetId === undefined) return null;
  const asset = await AssetService.getInstance(app).getAssetById(assetId);
  if (asset?.id !== assetId || (asset.type !== 'map' && asset.type !== 'scene')) return null;
  const path = await worldMapArtwork(app, asset);
  return path !== null && inAtlasFolders(path, asset.collection) ? path : null;
}
