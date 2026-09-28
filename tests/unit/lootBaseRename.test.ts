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
