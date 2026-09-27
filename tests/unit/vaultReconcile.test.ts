import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService, type SceneAsset } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const camp = 'atlas-vtt/collections/winter-camp';
const keep = 'atlas-vtt/collections/frozen-keep';
const MAP = JSON.stringify({ version: 3, state: { objects: { tokens: {}, pins: {} } } });

interface Setup extends InMemoryApp {
  service: AssetService;
  sceneId: string;
  tokenId: string;
  encounterId: string;
}

/** A vault with a collection holding a scene (map and JSON), token art and an encounter. */
async function setup(): Promise<Setup> {
  const vault = createInMemoryApp();
  const service = AssetService.getInstance(vault.app);
  await service.initialize();
  await service.createCollection('Winter Camp');
  await service.updateCollectionSettings('winter-camp', { conditions: [{ id: 'cold', name: 'Cold', color: '#00f' }] });
  await vault.app.vault.create(`${camp}/scenes/Cave.atlasmap`, MAP);
  await vault.app.vault.create(`${camp}/tokens/goblin_1790000000000_abcdef.webp`, 'IMG');
  const token = await service.addTokenAsset({ name: 'Goblin', imagePath: `${camp}/tokens/goblin_1790000000000_abcdef.webp`, collection: 'winter-camp', tags: [] });
  const scene = await service.addAsset({ type: 'scene', name: 'Cave', collection: 'winter-camp', tags: ['dark'], data: { mapPath: `${camp}/scenes/Cave.atlasmap` } });
  const encounter = await service.addAsset({ type: 'encounter', name: 'Ambush', collection: 'winter-camp', tags: [], tokens: [], data: { tokens: [] } });
  return { ...vault, service, sceneId: scene.id, tokenId: token.id, encounterId: encounter.id };
}

/** Moves a file or folder the way a file manager does: no rename event reaches Atlas. */
async function moveOutside(vault: InMemoryApp, from: string, to: string): Promise<void> {
  await vault.app.vault.adapter.rename(from, to);
}

beforeEach(() => { AssetService.resetInstance(); });

describe('collection folders changed outside Atlas', () => {
  it('keeps a collection whose folder was renamed in the file manager', async () => {
    const vault = await setup();
    const { uid } = (await vault.service.getCollection('winter-camp'))!;

    await moveOutside(vault, camp, keep);
    const result = await vault.service.reconcileWithVault(new Set([camp]));

    expect(result.folderMoves).toEqual([{ from: camp, to: keep }]);
    expect(await vault.service.getCollection('winter-camp')).toBeNull();
    const collection = await vault.service.getCollection('frozen-keep');
    expect(collection).toMatchObject({ uid, name: 'Frozen Keep', settings: { conditions: [{ id: 'cold' }] } });
    const scene = (await vault.service.getAssetById(vault.sceneId)) as SceneAsset;
    expect(scene).toMatchObject({ collection: 'frozen-keep', tags: ['dark'], data: { mapPath: `${keep}/scenes/Cave.atlasmap` } });
    expect(await vault.service.getAssetById(vault.tokenId)).toMatchObject({ collection: 'frozen-keep', imagePath: `${keep}/tokens/goblin_1790000000000_abcdef.webp` });
    expect(await vault.service.getAssetById(vault.encounterId)).toMatchObject({ collection: 'frozen-keep' });
  });

  it('keeps an empty collection whose folder was renamed', async () => {
    const { app } = createInMemoryApp();
    const service = AssetService.getInstance(app);
    await service.initialize();
    const { uid } = await service.createCollection('Winter Camp');

    await app.vault.adapter.rename(camp, keep);
    await service.reconcileWithVault();

    expect((await service.getCollections()).map((c) => [c.id, c.uid === uid])).toEqual([['default', false], ['frozen-keep', true]]);
  });

  it('keeps the default collection\'s settings when its folder was renamed while Obsidian was closed', async () => {
    const vault = createInMemoryApp({ files: { 'atlas-vtt/collections/default/scenes/Cave.atlasmap': MAP } });
    let service = AssetService.getInstance(vault.app);
    await service.initialize();
    const { uid } = (await service.getCollection('default'))!;
    await moveOutside(vault, 'atlas-vtt/collections/default', keep);

    AssetService.resetInstance();
    service = AssetService.getInstance(vault.app);
    await service.initialize();

    expect(await service.getCollection('frozen-keep')).toMatchObject({ uid });
    expect((await service.getAssets('frozen-keep', 'scene')).map((scene) => scene.name)).toEqual(['Cave']);
    expect((await service.getCollection('default'))?.uid).not.toBe(uid);
    expect(await service.getAssets('default')).toEqual([]);
  });

  it('takes in a collection folder added from outside with its files', async () => {
    const vault = await setup();
    vault.files.set(`${keep}/scenes/Hall.atlasmap`, MAP);
    vault.files.set(`${keep}/tokens/orc.webp`, 'IMG');
    vault.folders.add(keep);

    await vault.service.reconcileWithVault();

    expect(await vault.service.getCollection('frozen-keep')).toMatchObject({ name: 'Frozen Keep' });
    expect((await vault.service.getAssets('frozen-keep')).map((asset) => [asset.type, asset.name]).sort()).toEqual([['scene', 'Hall'], ['token', 'Orc']]);
  });

  it('gives a copied collection folder its own records', async () => {
    const vault = await setup();
    for (const [path, content] of [...vault.files]) {
      if (path.startsWith(`${camp}/`)) vault.files.set(keep + path.slice(camp.length), content);
    }
    vault.folders.add(keep);

    await vault.service.reconcileWithVault();

    const [copy] = await vault.service.getAssets('frozen-keep', 'scene');
    expect(copy).toMatchObject({ name: 'Cave', filePath: `${keep}/scenes/${vault.sceneId}.json`, data: { mapPath: `${keep}/scenes/Cave.atlasmap` } });
    expect(copy!.id).not.toBe(vault.sceneId);
    expect(await vault.service.getAssetById(vault.sceneId)).toMatchObject({ collection: 'winter-camp', data: { mapPath: `${camp}/scenes/Cave.atlasmap` } });
    expect(await vault.service.getAssets('frozen-keep', 'encounter')).toHaveLength(1);
  });
});

describe('scenes changed outside Atlas', () => {
  it('moves a scene whose map was moved to another collection, with its JSON', async () => {
    const vault = await setup();
    await vault.service.createCollection('Frozen Keep');
    const jsonBefore = `${camp}/scenes/${vault.sceneId}.json`;
    expect(vault.files.has(jsonBefore)).toBe(true);

    await moveOutside(vault, `${camp}/scenes/Cave.atlasmap`, `${keep}/scenes/Cave.atlasmap`);
    const result = await vault.service.reconcileWithVault();

    expect(result.fileMoves).toEqual([{ from: `${camp}/scenes/Cave.atlasmap`, to: `${keep}/scenes/Cave.atlasmap` }]);
    expect(await vault.service.getAssetById(vault.sceneId)).toMatchObject({
      collection: 'frozen-keep',
      filePath: `${keep}/scenes/${vault.sceneId}.json`,
      data: { mapPath: `${keep}/scenes/Cave.atlasmap` },
    });
    expect(vault.files.has(jsonBefore)).toBe(false);
    expect(vault.files.has(`${keep}/scenes/${vault.sceneId}.json`)).toBe(true);
    expect(await vault.service.getAssets('frozen-keep', 'scene')).toHaveLength(1);
  });

  it('moves a scene whose map was moved to another collection in Obsidian', async () => {
    const vault = await setup();
    await vault.service.createCollection('Frozen Keep');

    await vault.app.fileManager.renameFile(vault.app.vault.getFileByPath(`${camp}/scenes/Cave.atlasmap`)!, `${keep}/scenes/Cave.atlasmap`);
    await new FileReferenceService(vault.app).handleFileRenamed(`${camp}/scenes/Cave.atlasmap`, `${keep}/scenes/Cave.atlasmap`);
    await vault.service.reconcileWithVault();

    expect(await vault.service.getAssetById(vault.sceneId)).toMatchObject({ collection: 'frozen-keep', data: { mapPath: `${keep}/scenes/Cave.atlasmap` } });
    expect(vault.files.has(`${keep}/scenes/${vault.sceneId}.json`)).toBe(true);
  });

  it('removes a scene whose map was deleted, with its JSON', async () => {
    const vault = await setup();
    vault.files.delete(`${camp}/scenes/Cave.atlasmap`);

    await vault.service.reconcileWithVault(new Set([`${camp}/scenes/Cave.atlasmap`]));

    expect(await vault.service.getAssetById(vault.sceneId)).toBeNull();
    expect(vault.files.has(`${camp}/scenes/${vault.sceneId}.json`)).toBe(false);
  });

  it('adds a scene for a map file copied into a collection', async () => {
    const vault = await setup();
    vault.files.set(`${camp}/scenes/Dungeon/Crypt.atlasmap`, MAP);

    await vault.service.reconcileWithVault();

    expect((await vault.service.getAssets('winter-camp', 'scene')).map((scene) => scene.name).sort()).toEqual(['Cave', 'Crypt']);
  });
});

describe('other assets changed outside Atlas', () => {
  it('follows token art moved outside Atlas, keeping the token', async () => {
    const vault = await setup();
    await moveOutside(vault, `${camp}/tokens/goblin_1790000000000_abcdef.webp`, `${camp}/tokens/Goblins/goblin_1790000000000_abcdef.webp`);

    const result = await vault.service.reconcileWithVault();

    expect(result.fileMoves).toEqual([{ from: `${camp}/tokens/goblin_1790000000000_abcdef.webp`, to: `${camp}/tokens/Goblins/goblin_1790000000000_abcdef.webp` }]);
    expect(await vault.service.getAssets('winter-camp', 'token')).toEqual([
      expect.objectContaining({ id: vault.tokenId, imagePath: `${camp}/tokens/Goblins/goblin_1790000000000_abcdef.webp` }),
    ]);
  });

  it('removes an encounter only when its file was deleted, not when it is missing at startup', async () => {
    const vault = await setup();
    const json = `${camp}/encounters/${vault.encounterId}.json`;
    vault.files.delete(json);

    await vault.service.reconcileWithVault();
    expect(await vault.service.getAssetById(vault.encounterId)).not.toBeNull();

    await vault.service.reconcileWithVault(new Set([json]));
    expect(await vault.service.getAssetById(vault.encounterId)).toBeNull();
  });

  it('moves an encounter whose file was moved to another collection', async () => {
    const vault = await setup();
    await vault.service.createCollection('Frozen Keep');
    await moveOutside(vault, `${camp}/encounters/${vault.encounterId}.json`, `${keep}/encounters/${vault.encounterId}.json`);

    await vault.service.reconcileWithVault();

    expect(await vault.service.getAssetById(vault.encounterId)).toMatchObject({ collection: 'frozen-keep', filePath: `${keep}/encounters/${vault.encounterId}.json` });
  });

  it('changes nothing when the vault matches the index', async () => {
    const vault = await setup();
    await vault.service.reconcileWithVault();
    const saved = vault.files.get('atlas-vtt/.atlas-data/assets-metadata.json');

    const result = await vault.service.reconcileWithVault();

    expect(result.changed).toBe(false);
    expect(vault.files.get('atlas-vtt/.atlas-data/assets-metadata.json')).toBe(saved);
  });
});

describe('an incomplete vault listing', () => {
  it('removes nothing while the collections folder is not listed', async () => {
    const vault = await setup();
    const listed = vault.app.vault.getFolderByPath;
    vault.app.vault.getFolderByPath = (path: string) => (path === 'atlas-vtt/collections' ? null : listed(path));

    await vault.service.reconcileWithVault();

    expect((await vault.service.getCollections()).map((c) => c.id).sort()).toEqual(['default', 'winter-camp']);
    expect(await vault.service.getAssetById(vault.sceneId)).not.toBeNull();
  });
});
