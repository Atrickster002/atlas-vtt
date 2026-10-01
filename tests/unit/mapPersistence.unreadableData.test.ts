import { describe, expect, it, vi } from 'vitest';
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
  return { storage: createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) }), files };
}

function backupsOf(files: Map<string, string>): string[] {
  return [...files.keys()].filter((path) => path.startsWith(`${MAP_PATH}.`) && path.endsWith('.bak'));
}

describe('map data that cannot be loaded', () => {
  it.each([
    ['invalid JSON', '{"state": {"objects": '],
    ['an unexpected structure', JSON.stringify({ version: 4, state: { objects: { tokens: ['not', 'a', 'record'] } } })],
  ])('keeps a copy of a file with %s before the empty store can replace it', async (_label, content) => {
    const { storage, files } = createStorage(content);

    expect(await storage.getItem('atlas')).toBeNull();

    const backups = backupsOf(files);
    expect(backups).toHaveLength(1);
    expect(files.get(backups[0]!)).toBe(content);
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

describe('a map saved before tokens had resources', () => {
  it('upgrades version 4 tokens to resources when the map loads', async () => {
    const v4 = { version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, objects: { tokens: {
      a: { id: 'a', kind: 'character', x: 0, y: 0, imagePath: 'a.webp', hp: { current: 5, max: 12 }, stress: 2, maxStress: 6 },
      b: { id: 'b', kind: 'character', x: 0, y: 0, imagePath: 'b.webp', hp: 12 },
    } }, tokenSettings: { showNameplates: true, showHPBars: false, showStressBars: false, showInstanceBadges: true, tokenRingSize: 1 } } };
    const { storage, files } = createStorage(JSON.stringify(v4));

    const loaded = await storage.getItem('atlas');
    const tokens = (loaded?.state as { objects: { tokens: Record<string, Record<string, unknown>> } }).objects.tokens;

    expect(tokens.a!.resources).toEqual({ hp: { current: 5, max: 12 }, stress: { current: 2, max: 6 } });
    expect(tokens.a).not.toHaveProperty('hp');
    expect(tokens.a).not.toHaveProperty('maxStress');
    expect(tokens.b!.resources).toEqual({ hp: { current: 12, max: 100 } });
    // Both bar switches were off, so resources stay hidden on this map
    expect((loaded?.state as { tokenSettings: unknown }).tokenSettings).toEqual({ showNameplates: true, showResources: false, showInstanceBadges: true, tokenRingSize: 1 });
    expect((loaded?.state as { version: number }).version).toBe(5);
    expect(loaded?.version).toBe(5);
    expect(backupsOf(files)).toHaveLength(0);
  });
});
