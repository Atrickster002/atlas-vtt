// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { folderIdOf, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { assetFolderId, isTabAsset } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import { folderMoveProblem, moveAssetsIntoFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderMove';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({
  ATLAS_VIEW_TYPE: 'atlas-vtt',
  AtlasView: class { async saveMap(): Promise<void> {} },
}));

const MAPS = tabFolderPath('camp', 'maps');
const SCENES = tabFolderPath('camp', 'scenes');
const MAP_IMAGE = 'atlas-vtt/assets/forest_123.webp';
const SCENE_FILE = `${SCENES}/Forest.atlasmap`;

interface Vault { vault: InMemoryApp; assets: AssetService; mapId: string; sceneId: string }

async function seededVault(): Promise<Vault> {
  const vault = createInMemoryApp({ folders: [`${MAPS}/Wilderness`, `${SCENES}/Act 1`] });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('camp');
  await vault.app.vault.create(MAP_IMAGE, 'IMG');
  await vault.app.vault.create(SCENE_FILE, '{}');
  await assets.addAsset({ type: 'map', name: 'Forest', collection: 'camp', tags: [], mapFilePath: MAP_IMAGE });
  await assets.addAsset({ type: 'scene', name: 'Forest', collection: 'camp', tags: [], data: { mapPath: SCENE_FILE } });
  const [map] = await assets.getAssets('camp', 'map');
  const [scene] = await assets.getAssets('camp', 'scene');
  return { vault, assets, mapId: map!.id, sceneId: scene!.id };
}

async function folderOf(assets: AssetService, id: string, tabBase: string): Promise<string | null> {
  const asset: Asset | null = await assets.getAssetById(id);
  if (!asset || !isTabAsset(asset)) throw new Error(`No asset ${id}`);
  return assetFolderId(asset, tabBase);
}

beforeEach(() => { AssetService.resetInstance(); });

describe('moving assets into asset manager folders', () => {
  it('moves a map by moving its image into the folder', async () => {
    const { vault, assets, mapId } = await seededVault();
    const folder = folderIdOf(`${MAPS}/Wilderness`);

    const result = await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folder);

    expect(result).toEqual({ moved: [mapId], nameClashes: [], failed: [] });
    expect(vault.files.has(`${MAPS}/Wilderness/forest_123.webp`)).toBe(true);
    expect(vault.files.has(MAP_IMAGE)).toBe(false);
    expect(await folderOf(assets, mapId, MAPS)).toBe(folder);
  });

  it('moves a scene by moving its map file into the folder', async () => {
    const { vault, assets, sceneId } = await seededVault();
    const folder = folderIdOf(`${SCENES}/Act 1`);

    await moveAssetsIntoFolder(vault.app, assets, [sceneId], SCENES, folder);

    expect(vault.files.has(`${SCENES}/Act 1/Forest.atlasmap`)).toBe(true);
    expect(await folderOf(assets, sceneId, SCENES)).toBe(folder);
  });

  it('moves an asset out of a folder to the top level of its tab', async () => {
    const { vault, assets, mapId } = await seededVault();
    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folderIdOf(`${MAPS}/Wilderness`));

    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, null);

    expect(vault.files.has(`${MAPS}/forest_123.webp`)).toBe(true);
    expect(await folderOf(assets, mapId, MAPS)).toBeNull();
  });

  it('leaves assets that are already in the target folder alone', async () => {
    const { vault, assets, mapId } = await seededVault();

    const result = await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, null);

    expect(result.moved).toEqual([]);
    expect(vault.files.has(MAP_IMAGE)).toBe(true);
  });

  it('keeps an asset in place when the folder already holds a file of the same name', async () => {
    const { vault, assets, sceneId } = await seededVault();
    await vault.app.vault.create(`${SCENES}/Act 1/Forest.atlasmap`, '{}');

    const result = await moveAssetsIntoFolder(vault.app, assets, [sceneId], SCENES, folderIdOf(`${SCENES}/Act 1`));

    expect(result).toEqual({ moved: [], nameClashes: ['Forest'], failed: [] });
    expect(await assets.getAssetById(sceneId)).toMatchObject({ data: { mapPath: SCENE_FILE } });
    expect(folderMoveProblem(result)).toBe('Forest stayed: the folder already holds a file of the same name.');
  });
});
