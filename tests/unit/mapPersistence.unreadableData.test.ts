import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';

const MAP_PATH = 'maps/cave.atlasmap';

function createStorage(content: string): {
  storage: ReturnType<typeof createAtlasStorage>;
  files: Map<string, string>;
} {
  const { app, files } = createInMemoryApp({ files: { [MAP_PATH]: content } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.copy = vi.fn(async (file: TFile, newPath: string) => {
    files.set(newPath, files.get(file.path) ?? '');
    return file;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return { storage: createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) }), files };
}

afterEach(() => vi.restoreAllMocks());

function backupsOf(files: Map<string, string>): string[] {
  return [...files.keys()].filter((path) => path.startsWith(`${MAP_PATH}.`) && path.endsWith('.bak'));
}

describe('map data that cannot be loaded', () => {
  it.each([
    ['invalid JSON', '{"state": {"objects": ', 'The scene file is not valid JSON'],
    ['an unexpected structure', JSON.stringify({ version: 4, state: { objects: { tokens: ['not', 'a', 'record'] } } }), 'The scene file has an unexpected structure'],
    ['no saved state', '{}', 'The scene file has an unexpected structure'],
  ])('refuses a file with %s instead of loading it as an empty map, and keeps a copy', async (_label, content, reason) => {
    const { storage, files } = createStorage(content);

    await expect(storage.getItem('atlas')).rejects.toThrow(reason);

    const backups = backupsOf(files);
    expect(backups).toHaveLength(1);
    expect(files.get(backups[0]!)).toBe(content);
    expect(files.get(MAP_PATH)).toBe(content);
  });

  it.each([
    ['the file', { version: 5, state: { mapPath: MAP_PATH, objects: { tokens: {} } } }],
    ['its state', { version: 4, state: { version: 5, mapPath: MAP_PATH, objects: { tokens: {} } } }],
  ])('refuses a file of a newer Atlas by the version of %s, and leaves it alone', async (_label, saved) => {
    const content = JSON.stringify(saved);
    const { storage, files } = createStorage(content);

    await expect(storage.getItem('atlas')).rejects.toThrow('The scene was saved by a newer version of Atlas VTT');

    expect(backupsOf(files)).toHaveLength(0);
    expect(files.get(MAP_PATH)).toBe(content);
  });

  it('refuses a file that cannot be read', async () => {
    const { app } = createInMemoryApp({ files: { [MAP_PATH]: '{}' } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    vi.spyOn(app.vault, 'read').mockRejectedValue(new Error('EIO: i/o error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) });

    await expect(storage.getItem('atlas')).rejects.toThrow('The scene file could not be read');
  });

  it('starts a map without a file empty', async () => {
    const { app } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) });

    expect(await storage.getItem('atlas')).toBeNull();
  });

  it('does not back up data it can load', async () => {
    const { storage, files } = createStorage(JSON.stringify({ version: 4, state: { mapPath: MAP_PATH, objects: { tokens: {} } } }));

    expect(await storage.getItem('atlas')).not.toBeNull();
    expect(backupsOf(files)).toHaveLength(0);
  });
});

describe('a map file that was moved or renamed while closed', () => {
  it('loads everything it holds and takes its new path', async () => {
    const saved = { version: 4, state: { mapPath: 'old/cave.atlasmap', objects: { tokens: {}, fog: { f1: { id: 'f1' } }, walls: { w1: { id: 'w1' } } } } };
    const { storage, files } = createStorage(JSON.stringify(saved));

    const loaded = await storage.getItem('atlas');

    expect(loaded?.state).toMatchObject({ mapPath: MAP_PATH, objects: { fog: { f1: { id: 'f1' } }, walls: { w1: { id: 'w1' } } } });
    expect(backupsOf(files)).toHaveLength(0);
  });
});
