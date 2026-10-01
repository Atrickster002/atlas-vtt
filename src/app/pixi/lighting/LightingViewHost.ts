import type { ViewAtlasStore } from '../../storeFactory';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import type { HideableLayer } from '../playerSafeFrame';
import type { LightingUnavailable } from './LightingRenderer';
import type { SceneLightingView } from './sceneLightingView';

export interface LightingViewHostDeps {
  store: ViewAtlasStore;
  /** PIXI draws with Canvas 2D, which has no shaders: the fallback from the start, for good. */
  canvasRenderer: boolean;
  /** The GPU engine's view; it calls `onUnavailable` once when it cannot light the map, and has stopped by then. */
  createEngineView: (onUnavailable: (reason: LightingUnavailable) => void) => SceneLightingView;
  createFallback: () => SceneLightingView;
  /** Drops the device's note of an attempt on this map that never finished. */
  forgetAttempt: () => void;
  /** Tells the GM that line of sight stands in for dynamic lighting; `canRetry` when switching it off and on tries again. */
  notify: (canRetry: boolean) => void;
}

/** The player-frame switch the map view holds on to, whichever view draws at the moment. */
class ModeLayer implements HideableLayer {
  private capturing = false;

  constructor(private readonly current: () => SceneLightingView) {}

  get visible(): boolean {
    return this.capturing;
  }

  set visible(capturing: boolean) {
    this.capturing = capturing;
    this.current().modeLayer.visible = capturing;
  }
}

/**
 * The scene lighting of one map view, on the GPU engine while the graphics device can run it
 * and on the line-of-sight fallback when it cannot. Everything outside talks to this one
 * object, so the player-frame capture, the preview and the sight the tokens are checked
 * against carry over when the view behind it is swapped.
 *
 * The engine's view is replaced when it reports itself unavailable: `failed` (its shaders do
 * not compile here, or a pass threw) for the rest of this view's life, `unfinished` (its last
 * attempt on this map never drew a frame, so it may have crashed the graphics process) until
 * the GM switches dynamic lighting off, which forgets that attempt and brings the engine back.
 */
export class LightingViewHost implements SceneLightingView {
  readonly modeLayer: HideableLayer = new ModeLayer(() => this.view);
  private view: SceneLightingView;
  private previewing = false;
  private retryOnSwitchOff = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: LightingViewHostDeps) {
    this.view = deps.canvasRenderer ? deps.createFallback() : this.startEngine();
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      if (this.retryOnSwitchOff && previous.lighting.enabled && !state.lighting.enabled) this.retryEngine();
    });
  }

  isEnabled(): boolean { return this.view.isEnabled(); }
  currentSight(): Sight { return this.view.currentSight(); }
  lightReaches(): LightReach[] { return this.view.lightReaches(); }
  ambientLight(): AmbientLight { return this.view.ambientLight(); }
  refreshBounds(): void { this.view.refreshBounds(); }
  resetExplored(): void { this.view.resetExplored(); }
  beforeMapUnload(): void { this.view.beforeMapUnload(); }

  setPreview(on: boolean): void {
    this.previewing = on;
    this.view.setPreview(on);
  }

  destroy(): void {
    this.unsubscribe();
    this.view.destroy();
  }

  /** The engine's view, or the fallback when the engine gives up while it is being constructed. */
  private startEngine(): SceneLightingView {
    const start: { done: boolean; gaveUp: LightingUnavailable | null } = { done: false, gaveUp: null };
    const view = this.deps.createEngineView((reason) => {
      if (start.done && this.view === view) this.replace(this.fallbackAfter(reason));
      else start.gaveUp = reason;
    });
    start.done = true;
    if (!start.gaveUp) return view;
    const fallback = this.fallbackAfter(start.gaveUp);
    view.destroy();
    return fallback;
  }

  private fallbackAfter(reason: LightingUnavailable): SceneLightingView {
    this.retryOnSwitchOff = reason === 'unfinished';
    // A failure Atlas handled is no crash: the next session may try, and will be told again.
    if (reason === 'failed') this.deps.forgetAttempt();
    this.deps.notify(this.retryOnSwitchOff);
    return this.deps.createFallback();
  }

  private retryEngine(): void {
    this.retryOnSwitchOff = false;
    this.deps.forgetAttempt();
    this.replace(this.startEngine());
  }

  /** The next view is in place, with the player mode of the last, before the last is destroyed. */
  private replace(next: SceneLightingView): void {
    const last = this.view;
    this.view = next;
    next.modeLayer.visible = this.modeLayer.visible;
    next.setPreview(this.previewing);
    last.destroy();
  }
}
