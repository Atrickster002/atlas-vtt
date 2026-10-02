import '../setup/obsidianDom';
import { Container, type Application, type Texture, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { ExploredEdit } from '../../src/app/lighting/exploredEdits';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { HISTORY_LIMIT, getHistoryStore, type HistoryState } from '../../src/app/stores/history';
import type { StrokeShape } from '../../src/app/tools/shapeStroke';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import type { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import { createTestRenderer, readRgba, renderThroughEngine, type PixelReader } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import type { ExploredTexture } from '../../src/app/pixi/lighting/ExploredTexture';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { playerTokenSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { SAVE_DELAY, SIZE, createHarness, nextFrame, resetContext, until } from '../../src/app/pixi/lighting/__tests__/rendererHarness';

/**
 * A dark map of two rooms, a wall between them from top to bottom at x = 128. The party's token
 * stands in the left one and sees 70 px; a lamp and a goblin are in the right one.
 */
const WALL = { type: 'solid' as const, p1: { x: 128, y: 0 }, p2: { x: 128, y: SIZE }, closed: true };
const PARTY = { id: 'party', kind: 'token', imagePath: 'p.png', x: 60, y: 128, vision: { enabled: true, range: 5 } } as TokenEntity;
const GOBLIN = { id: 'goblin', kind: 'token', imagePath: 'g.png', x: 200, y: 100 } as TokenEntity;
const LAMP = { x: 200, y: 128, emission: { bright: 5, dim: 10, color: '#ffffff', intensity: 1, animation: 'none' as const } };
/** The right room, from the wall's centre line to the map's edge. */
const RIGHT_ROOM: StrokeShape = { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE };
const reveal = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'reveal', area });
const forget = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'forget', area });

interface Scene {
  renderer: WebGLRenderer;
  store: ViewAtlasStore;
  lighting: LightingRenderer;
  history: () => HistoryState;
  /** The memory's coverage (0..255) at a point of the map. */
  redAt: (x: number, y: number) => number;
  /** What the players see of a white map, one screen pixel per world pixel. */
  players: () => PixelReader;
  /** The texture the GM's overlay was last handed. */
  overlayTexture: () => Texture | null;
  /** What the overlay was told of undo (true) and redo (false). */
  travels: boolean[];
  settle: () => Promise<void>;
}

describe('editing the explored memory', () => {
  const cleanup: (() => void)[] = [];
  let watch: GlWatch | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    watch?.stop();
    // Every stamp, read and write of the memory ran under strict GL.
    expect(watch?.findings ?? []).toEqual([]);
    watch = null;
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The two rooms with the real store, its undo history and the real lighting renderer. */
  async function scene(options: { lighting?: Partial<SceneLighting>; exploredMask?: string | null; lamp?: boolean } = {}): Promise<Scene> {
    const renderer = await createTestRenderer(SIZE);
    watch = watchGl(renderer.gl);
    const store = createViewAtlasStore(createInMemoryApp().app, `memory-edits-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/rooms.atlasmap', exploredMask: options.exploredMask ?? null });
    store.getState().setSceneLighting({ enabled: true, ambient: 0, ...options.lighting });
    store.getState().addWall(WALL);
    store.setState((state) => ({ objects: { ...state.objects, tokens: { party: PARTY, goblin: GOBLIN } } }));
    if (options.lamp !== false) store.getState().addLight(LAMP);
    const history = getHistoryStore(store)!;
    history.getState().clear();

    const viewport = new Container();
    const ticks: (() => void)[] = [];
    const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: vi.fn() } } as unknown as Application;
    let overlayTexture: Texture | null = null;
    const travels: boolean[] = [];
    const lighting = new LightingRenderer({
      viewport: viewport as unknown as Viewport,
      app,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => ({ width: SIZE, height: SIZE }),
      albedo: () => null,
      exploredWatcher: { setTexture: (texture) => { overlayTexture = texture; }, memoryTravelled: (undone) => travels.push(undone) },
    });
    cleanup.push(() => {
      lighting.destroy();
      viewport.destroy({ children: true });
      renderer.destroy();
    });
    const explored = (): ExploredTexture => (lighting as unknown as { memory: { texture: ExploredTexture } }).memory.texture;
    return {
      renderer,
      store,
      lighting,
      history: () => history.getState(),
      redAt: (x, y) => readRgba(renderer, explored().texture)[(y * explored().texture.width + x) * 4]!,
      players: () => {
        lighting.modeLayer.visible = true;
        const engine = (lighting as unknown as { engine: LightingEngine }).engine;
        engine.flush();
        const at = renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0, map: SIZE });
        lighting.modeLayer.visible = false;
        return at;
      },
      overlayTexture: () => overlayTexture,
      travels,
      settle: async () => {
        for (let frame = 0; frame < 6; frame++) await nextFrame();
      },
    };
  }

  it('reveals and forgets with each shape on the texture sight records into', async () => {
    const { lighting, redAt } = await scene();
    expect(redAt(200, 128)).toBe(0);
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(redAt(200, 128)).toBe(255);
    expect(redAt(130, 5)).toBe(255);
    expect(redAt(120, 128)).toBe(0);

    expect(lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 180, y: 60 }, { x: 220, y: 60 }] }))).toBe(true);
    expect(redAt(200, 60)).toBe(0);
    expect(redAt(200, 76)).toBe(0);
    expect(redAt(200, 84)).toBe(255);

    expect(lighting.editExplored(reveal({ type: 'lasso', points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 60, y: 90 }] }))).toBe(true);
    expect(redAt(60, 40)).toBe(255);
    expect(redAt(20, 90)).toBe(0);

    expect(lighting.editExplored(reveal('everything'))).toBe(true);
    for (const [x, y] of [[0, 0], [255, 255], [200, 60], [20, 90]] as const) expect(redAt(x, y)).toBe(255);
    lighting.resetExplored();
    for (const [x, y] of [[0, 0], [255, 255], [200, 60], [60, 40]] as const) expect(redAt(x, y)).toBe(0);
  });

  it('makes each edit one undo step, and none of an edit that changes nothing', async () => {
    const { lighting, store, history } = await scene();
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(history().pastStates).toHaveLength(1);
    expect(store.getState().exploredEdits).toBe(1);
    // Revealed already, forgotten already, or outside the map: nothing to take back.
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
    expect(lighting.editExplored(forget({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100 }))).toBe(false);
    expect(lighting.editExplored(reveal({ type: 'rectangle', x: 900, y: 900, width: 50, height: 50 }))).toBe(false);
    lighting.resetExplored();
    lighting.resetExplored();
    expect(history().pastStates).toHaveLength(2);
    expect(store.getState().exploredEdits).toBe(2);
  });

  it('undoes and redoes memory edits among the store\'s own steps, in the order they were made', async () => {
    const { lighting, store, history, redAt, travels } = await scene();
    const walls = (): number => Object.keys(store.getState().objects.walls).length;
    /** The right room's memory at the brush's spot and away from it, and the walls on the map. */
    const state = (): string => `${redAt(200, 128)} ${redAt(240, 40)} ${walls()} walls`;

    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(state()).toBe('0 255 2 walls');
    expect(history().pastStates).toHaveLength(3);

    history().undo();
    expect(state()).toBe('255 255 2 walls');
    history().undo();
    expect(state()).toBe('255 255 1 walls');
    history().undo();
    expect(state()).toBe('0 0 1 walls');
    expect(history().pastStates).toHaveLength(0);

    history().redo();
    expect(state()).toBe('255 255 1 walls');
    history().redo();
    expect(state()).toBe('255 255 2 walls');
    history().redo();
    expect(state()).toBe('0 255 2 walls');
    expect(history().futureStates).toHaveLength(0);
    // The overlay's owner heard of each memory step that went back or forth, and of none of the wall's or the edits themselves.
    expect(travels).toEqual([true, true, false, false]);
  });

  it('gives the memory back texel for texel, soft edges and what sight recorded before included', async () => {
    const { renderer, lighting, store, history } = await scene({ lighting: { ambient: 1 } });
    const pixels = (): Uint8ClampedArray => readRgba(renderer, (lighting as unknown as { memory: { texture: ExploredTexture } }).memory.texture.texture);
    /** Every texel of the memory, as one number (FNV-1a): two textures are equal when these are. */
    const texture = (): number => pixels().reduce((hash, value) => Math.imul(hash ^ value, 0x01000193), 0x811c9dc5) >>> 0;
    // By day the token has seen its room up to 70 px: a round, soft-edged memory.
    expect(pixels().some((value, i) => i % 4 === 0 && value > 20 && value < 235)).toBe(true);
    const seen = texture();

    lighting.editExplored(forget({ type: 'brush', brushRadius: 30, points: [{ x: 30, y: 100 }, { x: 110, y: 160 }] }));
    const forgotten = texture();
    expect(forgotten).not.toBe(seen);
    lighting.editExplored(reveal({ type: 'lasso', points: [{ x: 5, y: 5 }, { x: 250, y: 40 }, { x: 100, y: 250 }] }));
    const revealed = texture();
    expect(revealed).not.toBe(forgotten);

    history().undo();
    expect(texture()).toBe(forgotten);
    history().undo();
    expect(texture()).toBe(seen);
    history().redo();
    history().redo();
    expect(texture()).toBe(revealed);
    expect(store.getState().exploredEdits).toBe(2);
  });

  it('drops the redo of an edit when a new edit follows an undo', async () => {
    const { lighting, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    history().undo();
    lighting.editExplored(reveal({ type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }));
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(redAt(20, 20)).toBe(0);
    expect(redAt(200, 128)).toBe(0);
    history().redo();
    expect(redAt(20, 20)).toBe(255);
    expect(redAt(200, 128)).toBe(0);
  });

  it('takes back only the texels of its stroke: what the tokens see afterwards elsewhere stays remembered', async () => {
    const { lighting, store, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    // Day breaks: the token's sight is recorded in the left room.
    store.getState().setSceneLighting({ ambient: 1 });
    expect(redAt(60, 128)).toBe(255);
    history().undo();
    expect(redAt(200, 128)).toBe(0);
    expect(redAt(60, 128)).toBe(255);
  });

  it('keeps a step for every step the undo history keeps', async () => {
    const { lighting, history, redAt } = await scene();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) lighting.editExplored(reveal({ type: 'rectangle', x: 4 * i, y: 0, width: 4, height: 4 }));
    expect(history().pastStates).toHaveLength(HISTORY_LIMIT);
    while (history().pastStates.length > 0) history().undo();
    // The five oldest edits left the history; every one it still held went back.
    expect(redAt(4 * 4 + 2, 2)).toBe(255);
    expect(redAt(4 * 5 + 2, 2)).toBe(0);
    expect(redAt(4 * (HISTORY_LIMIT + 4) + 2, 2)).toBe(0);
  });

  it('shows the players the explored look where the GM revealed, and nothing that is there now', async () => {
    const lit = await scene();
    const tokens = (): Record<string, TokenEntity> => lit.store.getState().objects.tokens;
    const sight = lit.lighting.currentSight();
    const reaches = lit.lighting.lightReaches();
    expect(playerTokenSight(lit.lighting, tokens())?.('goblin')).toBe('unseen');
    // Out of sight and unexplored: black, lamp or not.
    expect(lit.players()(200, 128)).toEqual([0, 0, 0]);

    lit.lighting.editExplored(reveal(RIGHT_ROOM));
    const after = lit.players();
    const [r, g, b] = after(200, 128);
    // The remembered map: dim and grey, far from the lamp's bright light.
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(110);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
    // What the tokens see and what light reaches them is what it was: the same objects.
    expect(lit.lighting.currentSight()).toBe(sight);
    expect(lit.lighting.lightReaches()).toBe(reaches);
    expect(playerTokenSight(lit.lighting, tokens())?.('goblin')).toBe('unseen');

    // The same room revealed in a scene without the lamp looks the same: the picture holds none of its light.
    const unlit = await scene({ lamp: false });
    unlit.lighting.editExplored(reveal(RIGHT_ROOM));
    const dark = unlit.players();
    for (const [x, y] of [[200, 128], [200, 100], [140, 20], [250, 250], [180, 128], [215, 140]] as const) expect(after(x, y)).toEqual(dark(x, y));
    // The GM's own picture still shows the lamp: the edit changed the memory alone.
    lit.lighting.modeLayer.visible = false;
  });

  it('shows the players the unexplored colour again where the GM made the scene forget', async () => {
    const { lighting, players } = await scene({ lighting: { unexploredColor: '#336699' } });
    lighting.editExplored(reveal(RIGHT_ROOM));
    lighting.editExplored(forget({ type: 'brush', brushRadius: 30, points: [{ x: 200, y: 128 }] }));
    const at = players();
    const [r, g, b] = at(200, 128);
    expect(Math.abs(r - 0x33)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0x66)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 0x99)).toBeLessThanOrEqual(1);
    // Around the brush the room is still remembered.
    expect(at(200, 30)[0]).toBeGreaterThan(40);
    expect(at(200, 30)[0]).toBe(at(200, 30)[2]);
  });

  it('saves an edit with the scene after the usual delay, and an undo of it too', async () => {
    const { lighting, store, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    expect(store.getState().exploredMask).toBeNull();
    vi.advanceTimersByTime(SAVE_DELAY);
    const saved = store.getState().exploredMask;
    expect(saved).toMatch(/^data:image\/png;base64,/);
    // The save itself is no undo step and does not disturb the memory.
    expect(history().pastStates).toHaveLength(1);
    expect(redAt(200, 128)).toBe(255);

    // Through a save and a reload: checked well inside the room and far from it only, since the
    // saved image's encoding is being reworked.
    const reloaded = await scene({ exploredMask: saved });
    await until(() => reloaded.redAt(200, 128) > 200);
    expect(reloaded.redAt(60, 128)).toBe(0);
    expect(reloaded.history().pastStates).toHaveLength(0);
    expect(reloaded.store.getState().exploredEdits).toBe(0);

    history().undo();
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).not.toBe(saved);
    const undone = await scene({ exploredMask: store.getState().exploredMask });
    await undone.settle();
    expect(undone.redAt(200, 128)).toBe(0);
  });

  it('forgets everything as an undo step, with explored memory on or off', async () => {
    for (const exploredMemory of [true, false]) {
      const { lighting, history, redAt } = await scene({ lighting: { exploredMemory } });
      lighting.editExplored(reveal(RIGHT_ROOM));
      lighting.resetExplored();
      expect(redAt(200, 128)).toBe(0);
      expect(history().pastStates).toHaveLength(2);
      history().undo();
      expect(redAt(200, 128)).toBe(255);
    }
  });

  it('leaves the memory\'s steps behind when the scene unloads: the history keeps the map\'s own', async () => {
    const { lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(history().pastStates).toHaveLength(3);

    lighting.beforeMapUnload();
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(history().pastStates).toHaveLength(0);
  });

  it('takes no edit back when a load starts the count over', async () => {
    const { lighting, store, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    // A load that reaches the store without the scene having been unloaded first.
    store.getState().setMapLoading(true, 0);
    store.getState().setExploredEdits(0);
    expect(redAt(200, 128)).toBe(255);
  });

  it('drops its steps with the texture when the map changes size', async () => {
    const renderer = await createTestRenderer(SIZE);
    watch = watchGl(renderer.gl);
    const store = createViewAtlasStore(createInMemoryApp().app, `memory-size-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/rooms.atlasmap' });
    store.getState().setSceneLighting({ enabled: true, ambient: 0 });
    const history = getHistoryStore(store)!;
    history.getState().clear();
    let bounds = { width: SIZE, height: SIZE };
    const viewport = new Container();
    const textures: (Texture | null)[] = [];
    const lighting = new LightingRenderer({
      viewport: viewport as unknown as Viewport,
      app: { renderer, ticker: { add: vi.fn(), remove: vi.fn() } } as unknown as Application,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => bounds,
      albedo: () => null,
      exploredWatcher: { setTexture: (texture) => textures.push(texture), memoryTravelled: vi.fn() },
    });
    cleanup.push(() => {
      lighting.destroy();
      viewport.destroy({ children: true });
      renderer.destroy();
    });
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall(WALL);
    expect(history.getState().pastStates).toHaveLength(2);
    expect(textures).toHaveLength(1);

    bounds = { width: SIZE * 2, height: SIZE };
    lighting.refreshBounds();
    // The overlay was handed the new texture before the old one went.
    expect(textures).toHaveLength(2);
    expect(textures[1]).not.toBe(textures[0]);
    expect(textures[0]!.destroyed).toBe(true);
    expect(history.getState().pastStates).toHaveLength(1);
    // The next edit is an undo step again, on the new texture.
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(history.getState().pastStates).toHaveLength(1);
  });

  it('hands the GM\'s overlay the memory\'s texture, and takes it back before the view goes', async () => {
    const { lighting, overlayTexture } = await scene();
    const texture = overlayTexture();
    expect(texture).not.toBeNull();
    expect(texture).toBe((lighting as unknown as { memory: { texture: ExploredTexture } }).memory.texture.texture);
    cleanup.pop()!();
    expect(overlayTexture()).toBeNull();
    cleanup.push(() => undefined);
  });

  it('drops its steps when a restored context draws the memory anew from the saved mask', async () => {
    const { renderer, lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    watch?.stop();
    watch = null;
    await resetContext(renderer, () => {
      // An undo while the context is lost has no texture to write to.
      history().undo();
    });
    // The next lighting work notices the restore.
    store.getState().setSceneLighting({ ambient: 0.05 });
    // Only the wall is left to undo: no step that would write texels of the texture that is gone.
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });

  it('edits nothing while a lost context holds the texture, and puts no step in the history', async () => {
    const { renderer, lighting, history } = await scene();
    watch?.stop();
    const lost = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    renderer.gl.getExtension('WEBGL_lose_context')!.loseContext();
    await lost;
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
    expect(history().pastStates).toHaveLength(0);
  });
});

describe('forgetting explored areas while the saved memory is not in yet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('drops the saved memory at once and for good, and edits nothing by hand meanwhile', async () => {
    const harness = await createHarness({ holdFirstDecode: true });
    const { lighting, state, setExploredMask, redAt, releaseFirstDecode, settle } = harness;
    try {
      expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
      lighting.resetExplored();
      expect(setExploredMask).toHaveBeenCalledWith(null);
      expect(state.exploredEdits).toBe(0);
      releaseFirstDecode();
      await settle();
      // The mask that was on its way in is not drawn after all.
      expect(redAt(200, 200)).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});
