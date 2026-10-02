import { normalizePath, type App } from 'obsidian';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import type { ProcessedImage } from '../../imageProcessing/imageProcessing';
import type { ScaleDown } from '../../imageProcessing/imageJob';
import { AssetService, type CollectionMetadata, type MapAsset, type SceneAsset } from '../../services/AssetService';
import type { AssetThumbnailService } from '../../services/AssetThumbnailService';
import { discardAssetFiles, writeAssetImage } from '../../services/assetImageFiles';
import { collectionFolderPath } from '../../services/assetPaths';
import { TransferFiles } from '../../services/assetTransfer/transferFiles';
import { newSceneFile } from '../../services/newSceneFile';
import { JSON_FOLDERS, defaultJsonPath } from '../../services/vault-sync/assetFiles';
import { UVTT_TOO_LARGE, parseUvtt } from './parseUvtt';
import { uvttSceneName } from './uvttFileNames';
import { uvttCellSize, uvttToScene, type UvttCounts, type UvttScene } from './uvttToScene';
import { UVTT_LIMITS, type UvttMap } from './uvttTypes';

export interface UvttImportDeps {
  app: App;
  assetService: AssetService;
  /** The file's image as a map stores it, with its thumbnail: the image workers. */
  convertImage: (image: Blob) => Promise<ProcessedImage>;
  thumbnails: Pick<AssetThumbnailService, 'tryThumbnailForImage'>;
}

export interface UvttImported {
  ok: true;
  /** The name of the new map and of its scene. */
  name: string;
  scenePath: string;
  counts: UvttCounts;
  /** The lights were imported switched off, since the image shows their glow already. */
  lightsOff: boolean;
  /** Set when the image had more pixels than a map keeps. */
  scaledDown?: ScaleDown;
}

export type UvttImportResult = UvttImported | { ok: false; problem: string };

interface Size {
  width: number;
  height: number;
}

const refused = (problem: string): { ok: false; problem: string } => ({ ok: false, problem });

const UNREADABLE_IMAGE = 'The map image in the file could not be read.';

function misfit(map: UvttMap, image: Size): string {
  return `The map image is ${image.width} × ${image.height} pixels, which does not fit a map of ${map.size.x} × ${map.size.y} squares.`;
}

/** The first of `base`, `base 2`, `base 3`… no scene file in `folder` carries, however its letters are cased. */
async function freeSceneName(app: App, folder: string, base: string): Promise<string> {
  for (let number = 1; ; number++) {
    const name = number === 1 ? base : `${base} ${number}`;
    if (!(await app.vault.adapter.exists(normalizePath(`${folder}/${name}.atlasmap`)))) return name;
  }
}

interface ImportPlan {
  baseName: string;
  collection: CollectionMetadata;
  image: ProcessedImage;
  scene: UvttScene;
}

type Written = { ok: true; name: string; scenePath: string } | { ok: false; problem: string };

/**
 * Writes the map and its scene: the image and its thumbnail, the scene file, and both records in
 * one save of the index. All of it happens under the index lock, so the vault check never sees
 * the new scene without its record and adds a second one. A failure takes back every file
 * written so far, still under the lock, and leaves the index as it was.
 */
function writeImport({ app, assetService, thumbnails }: UvttImportDeps, plan: ImportPlan): Promise<Written> {
  const { collection, scene } = plan;
  return assetService.runExclusive(async (): Promise<Written> => {
    const files = new TransferFiles(app);
    const images: string[] = [];
    try {
      const mapFilePath = await writeAssetImage(app, plan.baseName, await plan.image.image.arrayBuffer());
      images.push(mapFilePath);
      const thumbnailPath = await thumbnails.tryThumbnailForImage(mapFilePath, plan.image.thumbnail);
      if (thumbnailPath) images.push(thumbnailPath);

      const folder = `${collectionFolderPath(collection.id)}/${JSON_FOLDERS.scene}`;
      const name = await freeSceneName(app, folder, plan.baseName);
      const scenePath = normalizePath(`${folder}/${name}.atlasmap`);

      const content = newSceneFile(assetService.getCollectionSettings(collection.id), mapFilePath);
      // The file states its grid, so there is none to detect
      const { autoDetect: _autoDetect, ...grid } = content.state.grid;
      content.state.grid = { ...grid, ...scene.grid };
      content.state.objects = { ...content.state.objects, walls: scene.walls, lights: scene.lights };
      content.state.lighting = scene.lighting;
      await files.write(scenePath, JSON.stringify(content, null, 2));

      const now = Date.now();
      const identity = <T extends 'map' | 'scene'>(type: T): { id: string; type: T; filePath: string } => {
        const id = AssetService.newAssetId(type);
        return { id, type, filePath: defaultJsonPath(type, collection.id, id) };
      };
      const shared = { name, tags: [], collection: collection.id, createdAt: now, modifiedAt: now };
      const map: MapAsset = { ...identity('map'), ...shared, mapFilePath, ...(thumbnailPath && { thumbnailPath }) };
      const sceneRecord: SceneAsset = { ...identity('scene'), ...shared, data: { mapPath: scenePath } };
      for (const record of [map, sceneRecord]) {
        const recordFile = assetService.pendingRecordFile(record);
        if (recordFile) await files.write(recordFile.path, recordFile.content);
      }
      await assetService.commitAssetTransfer({ collectionId: collection.id, records: [map, sceneRecord], tags: [] });
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

async function importFile(deps: UvttImportDeps, file: File, collectionId: string): Promise<UvttImportResult> {
  if (file.size > UVTT_LIMITS.fileBytes) return refused(UVTT_TOO_LARGE);
  const parsed = parseUvtt(await file.text());
  if (!parsed.ok) return parsed;
  const { map } = parsed;

  const source = new Blob([map.image.bytes], { type: map.image.type });
  const sourceSize = await imageDimensions(source);
  if (!sourceSize) return refused(UNREADABLE_IMAGE);
  if (Math.max(sourceSize.width, sourceSize.height) > UVTT_LIMITS.imageSide) {
    return refused(`The map image is larger than ${UVTT_LIMITS.imageSide.toLocaleString('en-US')} pixels on a side.`);
  }
  if (uvttCellSize(map, sourceSize) === null) return refused(misfit(map, sourceSize));

  const collection = await deps.assetService.getCollection(collectionId);
  if (!collection) return refused('The collection no longer exists. Choose another collection and try again.');

  let image: ProcessedImage;
  try {
    image = await deps.convertImage(source);
  } catch (error) {
    console.error('[Atlas] The image of a Universal VTT file could not be converted', error);
    return refused(UNREADABLE_IMAGE);
  }
  // The size the scene shows the image at: the saved image's own, which a large map's was scaled down to
  const size = (await imageDimensions(image.image)) ?? image.scaledDown?.to ?? sourceSize;
  const cellSize = uvttCellSize(map, size);
  if (cellSize === null) return refused(misfit(map, size));

  const settings = deps.assetService.getCollectionSettings(collection.id);
  const scene = uvttToScene(map, { cellSize, unit: resolveMeasurementSettings(settings.gridDefaults, null) });
  const written = await writeImport(deps, { baseName: uvttSceneName(file.name), collection, image, scene });
  if (!written.ok) return written;
  return {
    ...written,
    counts: scene.counts,
    lightsOff: map.bakedLighting && scene.counts.lights > 0,
    ...(image.scaledDown && { scaledDown: image.scaledDown }),
  };
}

/**
 * Imports a Universal VTT file into a collection as a map and a scene of the same name, with
 * the file's walls, doors and lights and dynamic lighting on. The file is untrusted: whatever
 * is wrong with it comes back as a problem in plain words, and an import that fails leaves
 * neither a file nor a record. Never throws.
 */
export async function importUvttFile(deps: UvttImportDeps, file: File, collectionId: string): Promise<UvttImportResult> {
  try {
    return await importFile(deps, file, collectionId);
  } catch (error) {
    console.error('[Atlas] Importing a Universal VTT file failed', error);
    return refused('The file could not be imported.');
  }
}
