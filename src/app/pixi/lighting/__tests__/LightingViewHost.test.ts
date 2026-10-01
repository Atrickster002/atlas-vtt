import { describe, expect, it, vi } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import { SEES_ALL, type Sight } from '../../../vision/sight';
import type { LightingUnavailable } from '../LightingRenderer';
import { LightingViewHost } from '../LightingViewHost';
import type { SceneLightingView } from '../sceneLightingView';

interface FakeView extends SceneLightingView {
  modeLayer: { visible: boolean };
  preview: boolean;
  destroyed: boolean;
}

function fakeView(sight: Sight = SEES_ALL): FakeView {
  const view: FakeView = {
    modeLayer: { visible: false },
    preview: false,
    destroyed: false,
    isEnabled: () => true,
    setPreview: (on) => { view.preview = on; },
    currentSight: () => sight,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: vi.fn(),
    resetExplored: vi.fn(),
    beforeMapUnload: vi.fn(),
    destroy: () => { view.destroyed = true; },
  };
  return view;
}

const FALLBACK_SIGHT: Sight = { ...SEES_ALL, all: false };

interface Setup {
  host: LightingViewHost;
  engines: FakeView[];
  fallbacks: FakeView[];
  /** The latest engine view reports itself unavailable. */
  giveUp: (reason: LightingUnavailable) => void;
  switchLighting: (enabled: boolean) => void;
  forgetAttempt: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
}

function setup(options: { canvasRenderer?: boolean; givesUpAtStart?: LightingUnavailable } = {}): Setup {
  const engines: FakeView[] = [];
  const fallbacks: FakeView[] = [];
  const reports: ((reason: LightingUnavailable) => void)[] = [];
  const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
  let state = { lighting: { enabled: true, ambient: 1 } } as ViewAtlasState;
  const store = {
    getState: () => state,
    subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const forgetAttempt = vi.fn();
  const notify = vi.fn();
  let startsBroken = options.givesUpAtStart;
  const host = new LightingViewHost({
    store,
    canvasRenderer: options.canvasRenderer ?? false,
    createEngineView: (onUnavailable) => {
      const view = fakeView();
      engines.push(view);
      reports.push(onUnavailable);
      if (startsBroken) onUnavailable(startsBroken);
      startsBroken = undefined;
      return view;
    },
    createFallback: () => {
      const view = fakeView(FALLBACK_SIGHT);
      fallbacks.push(view);
      return view;
    },
    forgetAttempt,
    notify,
  });
  return {
    host,
    engines,
    fallbacks,
    giveUp: (reason) => reports.at(-1)!(reason),
    switchLighting: (enabled) => {
      const previous = state;
      state = { ...state, lighting: { ...state.lighting, enabled } };
      for (const listener of listeners) listener(state, previous);
    },
    forgetAttempt,
    notify,
  };
}

describe('LightingViewHost', () => {
  it('lights with the engine on a GPU renderer, without a notice', () => {
    const { host, engines, fallbacks, notify } = setup();
    expect(engines).toHaveLength(1);
    expect(fallbacks).toHaveLength(0);
    expect(host.currentSight()).toBe(SEES_ALL);
    expect(notify).not.toHaveBeenCalled();
  });

  it('uses the fallback on the canvas renderer, which has its own notice', () => {
    const { host, engines, fallbacks, notify } = setup({ canvasRenderer: true });
    expect(engines).toHaveLength(0);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify).not.toHaveBeenCalled();
  });

  it('swaps to the fallback when the engine fails, tells the GM once and destroys the engine view', () => {
    const { host, engines, fallbacks, giveUp, forgetAttempt, notify } = setup();
    giveUp('failed');
    expect(engines[0]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify.mock.calls).toEqual([[false]]);
    // The failure was handled: no note of a crash is left for the next session.
    expect(forgetAttempt).toHaveBeenCalledOnce();
  });

  it('keeps the player frame, the preview and its consumers working through the swap', () => {
    const { host, fallbacks, giveUp } = setup();
    const modeLayer = host.modeLayer;
    host.setPreview(true);
    modeLayer.visible = true;

    giveUp('failed');

    expect(host.modeLayer).toBe(modeLayer);
    expect(fallbacks[0]!.modeLayer.visible).toBe(true);
    expect(fallbacks[0]!.preview).toBe(true);
    modeLayer.visible = false;
    host.setPreview(false);
    expect(fallbacks[0]!.modeLayer.visible).toBe(false);
    expect(fallbacks[0]!.preview).toBe(false);
    host.refreshBounds();
    host.beforeMapUnload();
    expect(fallbacks[0]!.refreshBounds).toHaveBeenCalledOnce();
    expect(fallbacks[0]!.beforeMapUnload).toHaveBeenCalledOnce();
  });

  it('stays on the fallback for the rest of the view after a failure, whatever the GM switches', () => {
    const { engines, fallbacks, giveUp, switchLighting, notify } = setup();
    giveUp('failed');
    switchLighting(false);
    switchLighting(true);
    expect(engines).toHaveLength(1);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]!.destroyed).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('starts on the fallback when the last attempt never finished, and keeps its note', () => {
    const { host, engines, fallbacks, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    expect(engines[0]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify.mock.calls).toEqual([[true]]);
    expect(forgetAttempt).not.toHaveBeenCalled();
  });

  it('forgets the unfinished attempt and brings the engine back when the GM switches lighting off', () => {
    const { host, engines, fallbacks, switchLighting, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    host.setPreview(true);

    switchLighting(false);

    expect(forgetAttempt).toHaveBeenCalledOnce();
    expect(engines).toHaveLength(2);
    expect(engines[1]!.destroyed).toBe(false);
    expect(engines[1]!.preview).toBe(true);
    expect(fallbacks[0]!.destroyed).toBe(true);
    expect(host.currentSight()).toBe(SEES_ALL);
    switchLighting(true);
    switchLighting(false);
    expect(engines).toHaveLength(2);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('falls back for good when the retried engine fails', () => {
    const { engines, fallbacks, giveUp, switchLighting, notify } = setup({ givesUpAtStart: 'unfinished' });
    switchLighting(false);
    switchLighting(true);
    giveUp('failed');
    expect(engines[1]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(2);
    expect(notify.mock.calls).toEqual([[true], [false]]);
    switchLighting(false);
    expect(engines).toHaveLength(2);
  });

  it('destroys whichever view it holds, and stops listening', () => {
    const { host, engines, fallbacks, giveUp, switchLighting } = setup({ givesUpAtStart: 'unfinished' });
    host.destroy();
    expect(fallbacks[0]!.destroyed).toBe(true);
    switchLighting(false);
    expect(engines).toHaveLength(1);
    expect(() => giveUp('failed')).not.toThrow();
    expect(fallbacks).toHaveLength(1);
  });
});
