import type { App } from 'obsidian';
import { Container, Graphics, RenderTexture, type Application, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import { createTestRenderer } from '../engine/__tests__/gpuTestUtils';
import { watchGl } from '../engine/__tests__/strictGl';
import { LightingWorld } from '../engine/LightingWorld';
import { createSceneLighting } from '../createSceneLighting';
import { LIGHTING_ATTEMPTS_KEY } from '../lightingAttempts';
import type { LightingViewHost } from '../LightingViewHost';
import { SAVE_DELAY, SIZE, visionToken } from './rendererHarness';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
}));

const MAP = 'maps/cave.atlasmap';
const SAVED_MASK = 'data:image/png;base64,AAAA';

interface Scene {
  renderer: WebGLRenderer;
  viewport: Container;
  host: LightingViewHost;
  setExploredMask: ReturnType<typeof vi.fn>;
  /** The lighting notes in this device's local storage. */
  noted: () => unknown;
  switchLighting: (enabled: boolean) => void;
  tick: () => void;
  renderStage: () => void;
}

describe('scene lighting on a graphics device that cannot run the engine', () => {
  const cleanup: (() => void)[] = [];

  beforeEach(() => {
    notices.length = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function setup({ enabled, noted = null }: { enabled: boolean; noted?: string[] | null }): Promise<Scene> {
    const renderer = await createTestRenderer(SIZE);
    const viewport = new Container();
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    const setExploredMask = vi.fn();
    const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
    let state = {
      mapPath: MAP,
      lighting: { enabled, ambient: 0 },
      objects: { walls: {}, lights: {}, tokens: { t: visionToken(100, 128, 5) } },
      grid: null,
      exploredMask: SAVED_MASK,
      setExploredMask,
    } as unknown as ViewAtlasState;
    const store = {
      getState: () => state,
      subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
    } as unknown as ViewAtlasStore;
    const storage = new Map<string, unknown>([[LIGHTING_ATTEMPTS_KEY, noted]]);
    const obsApp = {
      loadLocalStorage: (key: string): unknown => storage.get(key) ?? null,
      saveLocalStorage: (key: string, data: unknown): void => void storage.set(key, data),
    } as unknown as App;
    const ticks: (() => void)[] = [];
    const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: (tick: () => void) => ticks.splice(ticks.indexOf(tick), 1) } } as unknown as Application;
    const host = createSceneLighting({
      viewport: viewport as unknown as Viewport,
      app,
      store,
      obsApp,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => ({ width: SIZE, height: SIZE }),
      albedo: () => null,
    });
    cleanup.push(() => {
      host.destroy();
      viewport.destroy({ children: true });
      target.destroy(true);
      renderer.destroy();
    });
    return {
      renderer,
      viewport,
      host,
      setExploredMask,
      noted: () => storage.get(LIGHTING_ATTEMPTS_KEY) ?? null,
      switchLighting: (on) => {
        const previous = state;
        state = { ...state, lighting: { ...state.lighting, enabled: on } };
        for (const listener of [...listeners]) listener(state, previous);
      },
      tick: () => [...ticks].forEach((tick) => tick()),
      renderStage: () => renderer.render({ container: viewport, target, clear: true }),
    };
  }

  /** Every program link fails from now on, as on a driver that rejects the shaders. */
  function breakLinking(renderer: WebGLRenderer): void {
    const { gl } = renderer;
    const original = gl.getProgramParameter.bind(gl);
    vi.spyOn(gl, 'getProgramParameter').mockImplementation((program: WebGLProgram, name: number): unknown => (name === gl.LINK_STATUS ? false : original(program, name)));
  }

  function engineLayer(viewport: Container): Container | undefined {
    return viewport.children.find((child) => child.label === 'lighting');
  }

  function darkness(viewport: Container): Graphics | undefined {
    return viewport.children.find((child): child is Graphics => child instanceof Graphics);
  }

  it('swaps to line of sight when the shaders do not link: one notice, clean renders, nothing saved', async () => {
    const scene = await setup({ enabled: false });
    const { renderer, viewport, host } = scene;
    const modeLayer = host.modeLayer;
    host.setPreview(true);
    breakLinking(renderer);

    expect(() => scene.switchLighting(true)).not.toThrow();
    vi.restoreAllMocks();

    expect(notices).toEqual(['Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow.']);
    expect(engineLayer(viewport)).toBeUndefined();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    // The players still see only what the token sees: the preview carried over to the fallback.
    expect(darkness(viewport)?.visible).toBe(true);
    expect(host.modeLayer).toBe(modeLayer);
    expect(host.currentSight().all).toBe(false);
    expect(host.currentSight().polygons).toHaveLength(1);
    expect(host.lightReaches()).toEqual([]);
    host.setPreview(false);
    expect(darkness(viewport)?.visible).toBe(false);
    modeLayer.visible = true;
    expect(darkness(viewport)?.visible).toBe(true);

    const watch = watchGl(renderer.gl);
    scene.renderStage();
    scene.tick();
    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(0);

    // The memory the scene saved is not the fallback's to write, and a failure Atlas handled leaves no note.
    vi.advanceTimersByTime(SAVE_DELAY);
    host.beforeMapUnload();
    expect(scene.setExploredMask).not.toHaveBeenCalled();
    expect(scene.noted()).toBeNull();

    scene.switchLighting(false);
    scene.switchLighting(true);
    expect(engineLayer(viewport)).toBeUndefined();
    expect(notices).toHaveLength(1);
  });

  it('starts with line of sight when the last attempt on this map never finished, and retries after off and on', async () => {
    const build = vi.spyOn(LightingWorld.prototype, 'update');
    const scene = await setup({ enabled: true, noted: [MAP] });
    const { renderer, viewport, host } = scene;

    expect(notices).toEqual(['Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow. Switch dynamic lighting off and on to try again.']);
    expect(build).not.toHaveBeenCalled();
    expect(engineLayer(viewport)).toBeUndefined();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    expect(host.currentSight().all).toBe(false);
    expect(scene.noted()).toEqual([MAP]);

    scene.switchLighting(false);
    expect(scene.noted()).toBeNull();
    expect(darkness(viewport)).toBeUndefined();

    scene.switchLighting(true);
    expect(build).toHaveBeenCalled();
    expect(engineLayer(viewport)?.filters).toHaveLength(1);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect(scene.noted()).toEqual([MAP]);

    scene.renderStage();
    scene.tick();
    expect(scene.noted()).toBeNull();
    expect(notices).toHaveLength(1);
  });

  it('notes the map only until the engine drew its first frame', async () => {
    const scene = await setup({ enabled: true });
    expect(scene.noted()).toEqual([MAP]);
    expect(engineLayer(scene.viewport)?.filters).toHaveLength(1);
    scene.tick();
    expect(scene.noted()).toEqual([MAP]);
    scene.renderStage();
    scene.tick();
    expect(scene.noted()).toBeNull();
    expect(notices).toEqual([]);
  });
});
