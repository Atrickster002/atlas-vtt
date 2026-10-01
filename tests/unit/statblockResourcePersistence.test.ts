import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { resourceUpdate } from '../../src/app/resources/resourceValues';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';

describe('token resource persistence', () => {
  it('round-trips independent changes to several resources through map storage', async () => {
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const path = 'maps/resources.atlasmap';
    const store = createViewAtlasStore(app, 'resources-test');
    store.setState({ mapPath: path, mapLoaded: true });
    const resources = { hp: { current: 27, max: 27 }, hope: { current: 6, max: 6 }, mana: { current: 8, max: 8 } };
    const [first, second] = [10, 30].map((x) => store.getState().addToken({ kind: 'character', x, y: 20, imagePath: 'mage.png', name: 'Mage', resources } as never));
    for (const [key, current] of [['hp', 15], ['hope', 2], ['mana', 3]] as const) {
      const token = store.getState().objects.tokens[first!]!;
      store.getState().updateToken(first!, resourceUpdate(token, key, { current, max: resources[key].max }, false));
    }
    await (store as typeof store & { flushStorage: () => Promise<void> }).flushStorage();
    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    const changed = { hp: { current: 15, max: 27 }, hope: { current: 2, max: 6 }, mana: { current: 3, max: 8 } };
    expect(saved.state.objects.tokens[first!].resources).toEqual(changed);
    expect(saved.state.objects.tokens[second!].resources).toEqual(resources);
    const reopened = createViewAtlasStore(app, 'resources-reopened');
    reopened.getState().setPersistenceEnabled(false);
    reopened.getState().setMapPath(path);
    await reopened.persist.rehydrate();
    expect(reopened.getState().objects.tokens[first!]!.resources).toEqual(changed);
  });
});
