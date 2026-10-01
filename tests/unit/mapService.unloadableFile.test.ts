import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, type App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/lighting/exploredMaskCodec', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/app/lighting/exploredMaskCodec')>();
  return { ...original, readExploredMask: vi.fn(original.readExploredMask) };
});

import { readExploredMask } from '../../src/app/lighting/exploredMaskCodec';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';

const SCENE = 'maps/tower.atlasmap';

function sceneState(version = 4): Record<string, unknown> {
  return {
    schema: 'atlas-vtt', version, mapPath: SCENE, background: null,
    grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: { mage: { id: 'mage', kind: 'token', x: 1, y: 2, imagePath: 'tokens/mage.png' } }, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
  };
}

const GOOD = JSON.stringify({ version: 4, state: sceneState() });

interface Harness {
  app: App;
  service: MapService;
  store: ViewAtlasStore;
  files: Map<string, string>;
  rendererService: RendererService;
}

function setup(content: string): Harness {
  const { app, files } = createInMemoryApp({ files: { [SCENE]: content } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  app.vault.copy = vi.fn(async (file, newPath: string) => {
    files.set(newPath, files.get(file.path) ?? '');
    return file;
  });
  const store = createViewAtlasStore(app, 'unloadable-file-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  const renderer = {
    setBackgroundSprite: vi.fn(), clearBackgroundSprite: vi.fn(), getGridSystem: () => null, initGrid: vi.fn(),
    getViewportInstance: () => null, getBackgroundSprite: () => null,
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return { app, service: new MapService(app, eventBus, store), store, files, rendererService: { getRenderer: () => renderer } as unknown as RendererService };
}

async function editAndSave(store: ViewAtlasStore): Promise<void> {
  store.getState().setSceneLighting({ enabled: true });
  store.getState().setGridVisible(false);
  await vi.advanceTimersByTimeAsync(600);
  await store.flushStorage();
}

/** What a failed load must leave behind: a notice with the reason, an unbound store and the file as it was. */
async function expectLoadRefused({ service, store, files, rendererService }: Harness, content: string, reason: string): Promise<void> {
  expect(await service.loadMap(rendererService, SCENE)).toBeNull();
  await editAndSave(store);

  expect(Notice).toHaveBeenCalledWith(`Atlas VTT could not open the scene tower (${reason}).`, 0);
  expect(store.getState().mapLoaded).toBe(false);
  expect(store.getState().mapPath).toBeNull();
  expect(store.getState().isMapLoading).toBe(false);
  expect(files.get(SCENE)).toBe(content);
}

const NEWER = 'The scene was saved by a newer version of Atlas VTT';
const STRUCTURE = 'The scene file has an unexpected structure';
const UNREADABLE = 'The scene file could not be read';

beforeEach(() => { vi.useFakeTimers(); vi.mocked(Notice).mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('a scene file that exists but does not load', () => {
  it('opens and saves a scene whose file loads', async () => {
    const harness = setup(GOOD);

    expect(await harness.service.loadMap(harness.rendererService, SCENE)).not.toBeNull();
    await editAndSave(harness.store);

    const saved = (JSON.parse(harness.files.get(SCENE) ?? '{}') as { state: ViewAtlasState }).state;
    expect(Object.keys(saved.objects.tokens)).toEqual(['mage']);
    expect(saved.lighting.enabled).toBe(true);
  });

  it.each<[string, string, string]>([
    ['is not valid JSON', '{"state": {"objects": ', 'The scene file is not valid JSON'],
    ['holds tokens that are not a record', JSON.stringify({ version: 4, state: { objects: { tokens: ['a', 'b'] } } }), STRUCTURE],
    ['holds a version that is not a number', JSON.stringify({ version: '4', state: sceneState() }), STRUCTURE],
    ['holds no state', '{}', STRUCTURE],
    ['holds a bare map without the saved state around it', JSON.stringify(sceneState()), STRUCTURE],
    ['was saved by a newer Atlas', JSON.stringify({ version: 5, state: sceneState(5) }), NEWER],
    ['holds a state of a newer Atlas', JSON.stringify({ version: 4, state: sceneState(5) }), NEWER],
  ])('fails the load and keeps the file when it %s', async (_label, content, reason) => {
    await expectLoadRefused(setup(content), content, reason);
  });

  it.each([
    ['at all', 0],
    ['a second time, when the store is filled from it', 1],
  ])('fails the load and keeps the file when it cannot be read %s', async (_label, readsBefore) => {
    const harness = setup(GOOD);
    const read = vi.mocked(harness.app.vault.read).getMockImplementation()!;
    let reads = 0;
    vi.spyOn(harness.app.vault, 'read').mockImplementation((file) => (reads++ < readsBefore ? read(file) : Promise.reject(new Error('EIO: i/o error'))));

    await expectLoadRefused(harness, GOOD, UNREADABLE);
  });

  it('fails the load and keeps the file when its state cannot be merged into the store', async () => {
    const harness = setup(GOOD);
    vi.mocked(readExploredMask).mockImplementationOnce(() => { throw new Error('Explored areas are damaged'); });

    await expectLoadRefused(harness, GOOD, 'Explored areas are damaged');
  });

  it('fails the load and keeps the file when a store subscriber throws while the state is restored', async () => {
    const harness = setup(GOOD);
    const unsubscribe = harness.store.subscribe((state) => state.objects.tokens, (tokens) => {
      if (!('mage' in tokens)) return;
      unsubscribe();
      throw new TypeError("Cannot read properties of null (reading 'x')");
    });

    await expectLoadRefused(harness, GOOD, "Cannot read properties of null (reading 'x')");
  });
});
