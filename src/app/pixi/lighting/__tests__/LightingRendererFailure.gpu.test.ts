import type { WebGLRenderer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { LightingWorld } from '../engine/LightingWorld';
import { ExploredTexture } from '../ExploredTexture';
import type { LightingAttempt } from '../lightingAttempts';
import type { LightingUnavailable } from '../LightingRenderer';
import { SAVE_DELAY, createHarness, resetContext, tokens, visionToken, type Harness } from './rendererHarness';

/** Every program link fails from now on, as on a driver that rejects the shaders. */
function breakLinking(renderer: WebGLRenderer): void {
  const { gl } = renderer;
  const original = gl.getProgramParameter.bind(gl);
  vi.spyOn(gl, 'getProgramParameter').mockImplementation((program: WebGLProgram, name: number): unknown => (name === gl.LINK_STATUS ? false : original(program, name)));
}

describe('LightingRenderer on a graphics device that cannot run the lighting', () => {
  let harness: Harness | null = null;
  const onUnavailable = vi.fn<(reason: LightingUnavailable) => void>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  });

  afterEach(() => {
    harness?.dispose();
    harness = null;
    onUnavailable.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Lighting off at first, so each test decides what the first build meets. */
  async function setup(attempt?: LightingAttempt): Promise<Harness> {
    harness = await createHarness({ patch: { lighting: { enabled: false, ambient: 1 } }, onUnavailable, ...(attempt ? { attempt } : {}) });
    return harness;
  }

  function switchOn({ state, change }: Harness): void {
    change({ lighting: { ...state.lighting, enabled: true }, ...tokens(visionToken(100)) });
  }

  function expectStopped({ lighting, renderer }: Harness): void {
    expect(lighting.layer.visible).toBe(false);
    expect(lighting.layer.filters).toBeNull();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
  }

  it('reports itself unavailable, once, when the shaders do not link, and the store change does not throw', async () => {
    const h = await setup();
    breakLinking(h.renderer);

    expect(() => switchOn(h)).not.toThrow();

    expect(onUnavailable.mock.calls).toEqual([['failed']]);
    expectStopped(h);
    h.change({ objects: { ...h.state.objects, tokens: { t: visionToken(120) } } });
    h.tick();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it('never saves explored memory once it stopped: the saved mask stays', async () => {
    const h = await setup();
    await h.settle();
    switchOn(h);
    vi.spyOn(LightingWorld.prototype, 'update').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'value')");
    });

    h.change({ objects: { ...h.state.objects, tokens: { t: visionToken(120) } } });

    expect(onUnavailable.mock.calls).toEqual([['failed']]);
    vi.advanceTimersByTime(SAVE_DELAY);
    h.lighting.beforeMapUnload();
    expect(h.setExploredMask).not.toHaveBeenCalled();
    expectStopped(h);
  });

  it('stops when stamping explored memory throws', async () => {
    const h = await setup();
    vi.spyOn(ExploredTexture.prototype, 'add').mockImplementation(() => {
      throw new Error('the stamp could not be drawn');
    });

    expect(() => switchOn(h)).not.toThrow();

    expect(onUnavailable.mock.calls).toEqual([['failed']]);
    expectStopped(h);
  });

  it('stops when saving explored memory throws, from its timer', async () => {
    const h = await setup();
    switchOn(h);
    // The saved mask is in: the texture is the memory, and its pending save may run.
    await h.settle();
    vi.spyOn(ExploredTexture.prototype, 'toCanvas').mockImplementation(() => {
      throw new Error('the pixels could not be read');
    });

    expect(() => vi.advanceTimersByTime(SAVE_DELAY)).not.toThrow();

    expect(onUnavailable.mock.calls).toEqual([['failed']]);
    expect(h.setExploredMask).not.toHaveBeenCalled();
  });

  it('stops when a frame of the ticker throws', async () => {
    const h = await setup();
    h.change({ lighting: { ...h.state.lighting, enabled: true }, objects: { walls: {}, tokens: {}, lights: { l: { id: 'l', x: 100, y: 100, emission: { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'torch' } } } } });
    vi.spyOn(LightingWorld.prototype, 'animate').mockImplementation(() => {
      throw new Error('the light map could not be drawn');
    });

    expect(() => h.tick()).not.toThrow();

    expect(onUnavailable.mock.calls).toEqual([['failed']]);
  });

  it('draws nothing inside PIXI\'s context runner: the rebuild waits for the next frame', async () => {
    const h = await setup();
    switchOn(h);
    const render = vi.spyOn(h.renderer, 'render');

    h.renderer.runners.contextChange.emit(h.renderer.gl);
    expect(render).not.toHaveBeenCalled();

    h.tick();
    expect(render).toHaveBeenCalled();
    expect(h.lighting.layer.filters).toHaveLength(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  describe('attempts', () => {
    function attemptThat(begins: boolean): { begin: Mock<() => boolean>; finish: Mock<() => void> } {
      return { begin: vi.fn(() => begins), finish: vi.fn() };
    }

    it('begins one before the first build and finishes it the frame after the first lit render', async () => {
      const attempt = attemptThat(true);
      const build = vi.spyOn(LightingWorld.prototype, 'update');
      const h = await setup(attempt);
      expect(attempt.begin).not.toHaveBeenCalled();

      switchOn(h);
      expect(attempt.begin).toHaveBeenCalledOnce();
      expect(attempt.begin.mock.invocationCallOrder[0]).toBeLessThan(build.mock.invocationCallOrder[0]!);
      h.tick();
      expect(attempt.finish).not.toHaveBeenCalled();

      h.renderStage();
      expect(attempt.finish).not.toHaveBeenCalled();
      h.tick();
      expect(attempt.finish).toHaveBeenCalledOnce();
      h.change({ objects: { ...h.state.objects, tokens: { t: visionToken(120) } } });
      h.renderStage();
      h.tick();
      expect(attempt.begin).toHaveBeenCalledOnce();
      expect(attempt.finish).toHaveBeenCalledOnce();
    });

    it('builds nothing and reports the attempt unfinished when the last one on this map never finished', async () => {
      const attempt = attemptThat(false);
      const build = vi.spyOn(LightingWorld.prototype, 'update');
      const h = await setup(attempt);
      const render = vi.spyOn(h.renderer, 'render');

      switchOn(h);

      expect(onUnavailable.mock.calls).toEqual([['unfinished']]);
      expect(build).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(h.renderer.backBuffer.useBackBuffer).toBe(false);
      expect(attempt.finish).not.toHaveBeenCalled();
    });

    it('ends an attempt without a frame when lighting is switched off or the map unloads', async () => {
      const attempt = attemptThat(true);
      const h = await setup(attempt);
      switchOn(h);
      h.change({ lighting: { ...h.state.lighting, enabled: false } });
      expect(attempt.finish).toHaveBeenCalledTimes(1);

      h.change({ lighting: { ...h.state.lighting, enabled: true } });
      expect(attempt.begin).toHaveBeenCalledTimes(2);
      h.lighting.beforeMapUnload();
      expect(attempt.finish).toHaveBeenCalledTimes(2);
    });

    it('begins again after a restored context, without finishing the attempt the loss cut short', async () => {
      const attempt = attemptThat(true);
      const h = await setup(attempt);
      switchOn(h);

      await resetContext(h.renderer);
      attempt.begin.mockReturnValue(false);
      const build = vi.spyOn(LightingWorld.prototype, 'update');
      h.tick();
      h.tick();

      expect(attempt.begin).toHaveBeenCalledTimes(2);
      expect(attempt.finish).not.toHaveBeenCalled();
      expect(onUnavailable.mock.calls).toEqual([['unfinished']]);
      expect(build).not.toHaveBeenCalled();
      expectStopped(h);
    });
  });
});
