import { normalizePath, type App } from 'obsidian';
import type { ProcessedImage } from '../../imageProcessing/imageProcessing';
import { prebuildMapImageAt } from '../../pixi/mapImage/prebuildMapImage';
import { AssetService, type CollectionMetadata, type MapAsset, type SceneAsset } from '../../services/AssetService';
import type { AssetThumbnailService } from '../../services/AssetThumbnailService';
import { discardAssetFiles, writeAssetImage } from '../../services/assetImageFiles';
import { collectionFolderPath } from '../../services/assetPaths';
import { TransferFiles } from '../../services/assetTransfer/transferFiles';
import type { NewSceneFile } from '../../services/newSceneFile';
import { JSON_FOLDERS, defaultJsonPath } from '../../services/vault-sync/assetFiles';
import { COLLECTION_GONE, refused } from './uvttSource';
import type { UvttRefusal } from './uvttTypes';

/** What writing an import needs of the app: the vault, the index, and where thumbnails are stored. */
export interface UvttWriteDeps {
  app: App;
  assetService: AssetService;
  thumbnails: Pick<AssetThumbnailService, 'tryThumbnailForImage'>;
}

/** One map image of the scene: a map asset of its own. */
export interface UvttMapToWrite {
  image: ProcessedImage;
  /** The map asset's name, given the name the scene gets. */
  name: (sceneName: string) => string;
}

export interface UvttWritePlan {
  collection: CollectionMetadata;
  /** The scene's name; numbered where a scene of the collection carries it already. */
  baseName: string;
  maps: readonly UvttMapToWrite[];
  /** The scene file, given where each map's image was written, in the order of `maps`. */
  content: (mapFilePaths: readonly string[]) => NewSceneFile;
}

export type UvttWritten = { ok: true; name: string; scenePath: string } | UvttRefusal;

/** The first of `base`, `base 2`, `base 3`… no scene file in `folder` carries, however its letters are cased. */
async function freeSceneName(app: App, folder: string, base: string): Promise<string> {
  for (let number = 1; ; number++) {
    const name = number === 1 ? base : `${base} ${number}`;
    if (!(await app.vault.adapter.exists(normalizePath(`${folder}/${name}.atlasmap`)))) return name;
  }
}

function newIdentity<T extends 'map' | 'scene'>(type: T, collectionId: string): { id: string; type: T; filePath: string } {
  const id = AssetService.newAssetId(type);
  return { id, type, filePath: defaultJsonPath(type, collectionId, id) };
}

/**
 * Writes an imported scene: each map's image and thumbnail, the scene file, and every record in
 * one save of the index. All of it happens under the index lock, so the vault check never sees
 * the new scene without its record and adds a second one. A failure takes back every file
 * written so far, still under the lock, and leaves the index as it was.
 */
export function writeUvttImport({ app, assetService, thumbnails }: UvttWriteDeps, plan: UvttWritePlan): Promise<UvttWritten> {
  const { collection } = plan;
  return assetService.runExclusive(async (): Promise<UvttWritten> => {
    // Deleted while the images were converted: writing now would bring its folders back
    if (!(await assetService.getCollection(collection.id))) return refused(COLLECTION_GONE);
    const files = new TransferFiles(app);
    const images: string[] = [];
    try {
      const folder = `${collectionFolderPath(collection.id)}/${JSON_FOLDERS.scene}`;
      const name = await freeSceneName(app, folder, plan.baseName);
      const scenePath = normalizePath(`${folder}/${name}.atlasmap`);
      const now = Date.now();
      const shared = { tags: [], collection: collection.id, createdAt: now, modifiedAt: now };

      const maps: MapAsset[] = [];
      for (const map of plan.maps) {
        const mapName = map.name(name);
        const mapFilePath = await writeAssetImage(app, mapName, await map.image.image.arrayBuffer());
        images.push(mapFilePath);
        const thumbnailPath = await thumbnails.tryThumbnailForImage(mapFilePath, map.image.thumbnail);
        if (thumbnailPath) images.push(thumbnailPath);
        maps.push({ ...newIdentity('map', collection.id), ...shared, name: mapName, mapFilePath, ...(thumbnailPath && { thumbnailPath }) });
      }

      await files.write(scenePath, JSON.stringify(plan.content(maps.map((map) => map.mapFilePath)), null, 2));
      const sceneRecord: SceneAsset = { ...newIdentity('scene', collection.id), ...shared, name, data: { mapPath: scenePath } };
      const records = [...maps, sceneRecord];
      for (const record of records) {
        const recordFile = assetService.pendingRecordFile(record);
        if (recordFile) await files.write(recordFile.path, recordFile.content);
      }
      await assetService.commitAssetTransfer({ collectionId: collection.id, records, tags: [] });
      for (const map of maps) prebuildMapImageAt(app, map.mapFilePath);
      return { ok: true, name, scenePath };
    } catch (error) {
      console.error('[Atlas] Saving an imported Universal VTT map failed', error);
      const left = await files.undo();
      await discardAssetFiles(app, images);
      left.push(...images.filter((path) => app.vault.getAbstractFileByPath(path) !== null));
      return refused(`The map could not be saved.${left.length > 0 ? ` These files could not be removed again: ${left.join(', ')}.` : ' Nothing was added.'}`);
    }
  });
}
