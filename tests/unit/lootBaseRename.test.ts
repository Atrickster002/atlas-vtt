import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));

import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => Reflect.set(AssetService, 'instance', null));

describe('moving a loot base in the vault', () => {
  it('keeps the collections that roll on it pointed at its new place', async () => {
    const { app } = createInMemoryApp({ files: { 'Loot/Items.base': 'views: []' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, { lootBases: ['Loot/Items.base', 'Loot/Rings.base'] });

    await new FileReferenceService(app).handleFilesMoved([
      { from: 'Loot/Items.base', to: 'Reference/Gear.base' },
      { from: 'Notes/Tavern.md', to: 'Notes/Inn.md' },
    ]);

    expect(assets.getCollectionSettings(collectionId).lootBases).toEqual(['Reference/Gear.base', 'Loot/Rings.base']);
  });
});

describe('moving the image that is a collection\'s world map', () => {
  it('keeps the collection pointed at it, and leaves other collections\' settings alone', async () => {
    const { app } = createInMemoryApp({ files: { 'Maps/World.webp': 'IMG', 'Loot/Items.base': 'views: []' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, { worldMap: 'Maps/World.webp', lootBases: ['Loot/Items.base'] });
    await assets.createCollection('Other');
    await assets.updateCollectionSettings('Other', { worldMap: 'Maps/Other.webp' });
    const untouched = (await assets.getCollection('Other'))!.modifiedAt;

    await new FileReferenceService(app).handleFilesMoved([{ from: 'Maps/World.webp', to: 'Atlas/Faerun.webp' }]);

    expect(assets.getCollectionSettings(collectionId)).toMatchObject({ worldMap: 'Atlas/Faerun.webp', lootBases: ['Loot/Items.base'] });
    expect(assets.getCollectionSettings('Other').worldMap).toBe('Maps/Other.webp');
    expect((await assets.getCollection('Other'))!.modifiedAt).toBe(untouched);
  });

  it('follows the image together with a loot base moved in the same step', async () => {
    const { app } = createInMemoryApp({ files: { 'Maps/World.webp': 'IMG', 'Loot/Items.base': 'views: []' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, { worldMap: 'Maps/World.webp', lootBases: ['Loot/Items.base'] });

    await new FileReferenceService(app).handleFilesMoved([
      { from: 'Maps/World.webp', to: 'Campaign/World.webp' },
      { from: 'Loot/Items.base', to: 'Campaign/Items.base' },
    ]);

    expect(assets.getCollectionSettings(collectionId)).toMatchObject({ worldMap: 'Campaign/World.webp', lootBases: ['Campaign/Items.base'] });
  });
});
