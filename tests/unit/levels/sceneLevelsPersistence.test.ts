import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { fakeMapRenderer } from '../../helpers/fakeMapRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { MapService } from '../../../src/app/services/MapService';
import type { RendererService } from '../../../src/app/services/RendererService';
import type { MapImageSource } from '../../../src/app/pixi/mapImage/mapImageTypes';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));

const SCENE = 'maps/tower.atlasmap';
const MASK_GROUND = 'data:image/png;base64,R1JPVU5E';
const MASK_UPPER = 'data:image/png;base64,VVBQRVI=';

const LEVELS = [
  { id: 'ground', name: 'Ground floor', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.png' },
  { id: 'upper', name: 'Upper floor', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png', future: 'kept' },
];

function sceneState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'atlas-vtt', version: 4, mapPath: SCENE, background: 'maps/ground.png',
    grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: { mage: { id: 'mage', kind: 'token', x: 1, y: 2, imagePath: 'tokens/mage.png', level: 'upper' } }, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
    ...extra,
  };
}

interface Harness { service: MapService; store: ViewAtlasStore; files: Map<string, string>; rendererService: RendererService; images: MapImageSource[] }

function setup(content: string): Harness {
  const { app, files } = createInMemoryApp({ files: { [SCENE]: content, 'maps/ground.png': '', 'maps/upper.png': '' } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'scene-levels-persistence-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  const images: MapImageSource[] = [];
  const renderer = fakeMapRenderer((source) => images.push(source));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return { service: new MapService(app, eventBus, store), store, files, rendererService: { getRenderer: () => renderer } as unknown as RendererService, images };
}

async function save(store: ViewAtlasStore): Promise<void> {
  await vi.advanceTimersByTimeAsync(600);
  await store.flushStorage();
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function savedFile(harness: Harness): { version: number; state: Record<string, unknown> & { version: number } } {
  return JSON.parse(harness.files.get(SCENE) ?? '{}');
}

describe('a scene with several levels on disk', () => {
  it('opens on the level its tab was left on, keeps its levels and memories, and is saved as version 5', async () => {
    const harness = setup(JSON.stringify({ version: 5, state: sceneState({ version: 5, levels: LEVELS, exploredMask: MASK_GROUND, exploredMasks: { upper: MASK_UPPER } }) }));

    expect(await harness.service.loadMap(harness.rendererService, SCENE, { centerX: 0, centerY: 0, scale: 1, level: 'upper' })).not.toBeNull();
    const state = harness.store.getState();
    expect(state.viewedLevel).toBe('upper');
    expect(state.levels?.map((level) => level.id)).toEqual(['ground', 'upper']);
    expect(state.exploredMasks).toEqual({ upper: MASK_UPPER });
    expect(harness.images.at(-1)).toMatchObject({ kind: 'file', file: { path: 'maps/upper.png' } });

    state.addToken({ x: 5, y: 5, imagePath: 'tokens/rogue.png' });
    await save(harness.store);

    const saved = savedFile(harness);
    expect(saved.version).toBe(5);
    expect(saved.state.version).toBe(5);
    expect(saved.state.levels).toEqual(LEVELS);
    expect(saved.state.exploredMasks).toEqual({ upper: MASK_UPPER });
    const tokens = Object.values((saved.state.objects as { tokens: Record<string, { level?: string }> }).tokens);
    expect(tokens.map((token) => token.level)).toEqual(['upper', 'upper']);
  });

  it('opens on the first level where the tab names a level the scene lacks', async () => {
    const harness = setup(JSON.stringify({ version: 5, state: sceneState({ version: 5, levels: LEVELS }) }));

    await harness.service.loadMap(harness.rendererService, SCENE, { centerX: 0, centerY: 0, scale: 1, level: 'cellar' });

    expect(harness.store.getState().viewedLevel).toBe('ground');
    expect(harness.images.at(-1)).toMatchObject({ kind: 'file', file: { path: 'maps/ground.png' } });
  });

  it('keeps a scene with one level a version 4 file, without levels', async () => {
    const harness = setup(JSON.stringify({ version: 4, state: sceneState() }));

    await harness.service.loadMap(harness.rendererService, SCENE);
    harness.store.getState().addToken({ x: 5, y: 5, imagePath: 'tokens/rogue.png' });
    await save(harness.store);

    const saved = savedFile(harness);
    expect(saved.version).toBe(4);
    expect(saved.state.version).toBe(4);
    expect(saved.state).not.toHaveProperty('levels');
    const tokens = Object.values((saved.state.objects as { tokens: Record<string, { level?: string }> }).tokens);
    expect(tokens.find((token) => token.level === undefined)).toBeDefined();
  });

  it('keeps the explored memory of each level where it belongs', async () => {
    const harness = setup(JSON.stringify({ version: 5, state: sceneState({ version: 5, levels: LEVELS }) }));
    await harness.service.loadMap(harness.rendererService, SCENE);
    const state = harness.store.getState();

    state.setExploredMask(MASK_GROUND);
    state.setExploredMask(MASK_UPPER, 'upper');
    state.setExploredMask(MASK_UPPER, 'gone');
    expect(harness.store.getState().exploredMask).toBe(MASK_GROUND);
    expect(harness.store.getState().exploredMasks).toEqual({ upper: MASK_UPPER });

    state.setViewedLevel('upper');
    state.setExploredMask(null);
    expect(harness.store.getState().exploredMasks).toBeUndefined();
  });
});

describe('moving tokens to another level', () => {
  it('moves the selection in one undo step and leaves the view where it is', async () => {
    const harness = setup(JSON.stringify({ version: 5, state: sceneState({ version: 5, levels: LEVELS }) }));
    await harness.service.loadMap(harness.rendererService, SCENE);
    const state = harness.store.getState();
    const rogue = state.addToken({ x: 5, y: 5, imagePath: 'tokens/rogue.png' });
    state.setSelection([rogue]);
    const temporal = (harness.store as unknown as { temporal: { getState(): { pastStates: unknown[]; undo(): void } } }).temporal;
    const steps = temporal.getState().pastStates.length;

    harness.store.getState().moveTokensToLevel([rogue], 'upper');

    expect(harness.store.getState().objects.tokens[rogue]?.level).toBe('upper');
    expect(harness.store.getState().viewedLevel).toBe('ground');
    expect(harness.store.getState().selectedIds).toEqual([]);
    expect(temporal.getState().pastStates).toHaveLength(steps + 1);
    temporal.getState().undo();
    expect(harness.store.getState().objects.tokens[rogue]?.level).toBe('ground');
  });

  it('is no undo step to show another level', async () => {
    const harness = setup(JSON.stringify({ version: 5, state: sceneState({ version: 5, levels: LEVELS }) }));
    await harness.service.loadMap(harness.rendererService, SCENE);
    const temporal = (harness.store as unknown as { temporal: { getState(): { pastStates: unknown[] } } }).temporal;

    harness.store.getState().setViewedLevel('upper');

    expect(temporal.getState().pastStates).toHaveLength(0);
  });
});
