import type { Renderer, Texture } from 'pixi.js';
import type { ViewAtlasStore } from '../../storeFactory';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import { saveExploredMask } from './exploredMaskSaving';
import { ExploredSaveScheduler } from './ExploredSaveScheduler';
import { ExploredTexture } from './ExploredTexture';

const EXPLORED_SAVE_DELAY = 2000;

export interface ExploredMemoryDeps {
  renderer: Renderer;
  store: ViewAtlasStore;
  /** Whoever draws the memory takes each new texture before the old one is destroyed. */
  onTexture: (texture: Texture) => void;
  /** The texture's pixels changed outside the stage's render. */
  onChange: () => void;
  /**
   * Runs GPU work this starts on its own (a save timer, a decoded mask): the owner skips it
   * while the graphics device cannot take it and keeps its errors from escaping.
   */
  guard: (work: () => void) => void;
}

/**
 * What the scene's tokens have seen, for one map view: the world-space texture, the mask it
 * was loaded from and the debounced save back into the scene. The texture is saved only while
 * it is the memory: not while a saved mask is on its way in or failed to load, and not between
 * a lost WebGL context and the reload after its restore, so a blank texture never replaces the
 * saved mask.
 */
export class ExploredMemory {
  private texture: ExploredTexture | null = null;
  private bounds: MapBounds | null = null;
  /** The mask the texture holds; undefined after a failed load, so that the next `sync` retries. */
  private loadedMask: string | null | undefined = null;
  /** Bumped whenever the texture's content is superseded, so a load decoded too late is dropped. */
  private loadGeneration = 0;
  private ready = true;
  private contextLost = false;
  private readonly saver: ExploredSaveScheduler;

  constructor(private readonly deps: ExploredMemoryDeps) {
    this.saver = new ExploredSaveScheduler(() => deps.store.getState().mapPath, () => deps.guard(() => this.save()), EXPLORED_SAVE_DELAY);
  }

  /** Sizes the memory to the map and loads the scene's saved mask unless the texture holds it. */
  sync(bounds: MapBounds, mask: string | null): void {
    this.ensure(bounds);
    if (mask !== this.loadedMask) void this.load(mask);
  }

  record(shapes: ExploredShapes): void {
    if (!this.texture) return;
    this.texture.add(shapes);
    this.saver.schedule();
  }

  reset(): void {
    this.supersede();
    this.deps.store.getState().setExploredMask(null);
    this.deps.guard(() => {
      this.texture?.clear();
      this.deps.onChange();
    });
  }

  /** The WebGL context is lost: nothing the texture holds from now on is the memory. */
  holdSaves(): void {
    this.contextLost = true;
    this.saver.cancel();
  }

  /**
   * The context is back and the texture blank, with lighting on or off: reload the saved
   * memory. A save pending from before holds only what the lost texture had.
   */
  reload(mask: string | null): void {
    this.contextLost = false;
    this.saver.cancel();
    this.loadedMask = null;
    void this.load(mask);
  }

  /** Before the map unloads: save the scene's pending memory into it, then start the next scene blank. */
  beforeMapUnload(): void {
    this.saver.flush();
    this.texture?.clear();
    this.supersede();
  }

  /** Lighting stopped: what is pending is never saved. */
  cancelSaves(): void {
    this.saver.cancel();
    this.loadGeneration++;
  }

  destroy(): void {
    this.cancelSaves();
    this.texture?.destroy();
    this.texture = null;
  }

  private supersede(): void {
    this.loadedMask = null;
    this.loadGeneration++;
    this.ready = true;
  }

  private ensure(bounds: MapBounds): void {
    if (this.texture && this.bounds?.width === bounds.width && this.bounds.height === bounds.height) return;
    const previous = this.texture;
    this.texture = new ExploredTexture(this.deps.renderer, bounds);
    this.bounds = bounds;
    this.supersede();
    this.deps.onTexture(this.texture.texture);
    previous?.destroy();
  }

  /**
   * Each load supersedes the ones before it (a map switch or reset mid-decode must not draw the
   * old scene's memory), and the texture is unsaveable until its mask is in.
   */
  private async load(mask: string | null): Promise<void> {
    const generation = ++this.loadGeneration;
    const texture = this.texture;
    this.loadedMask = mask;
    if (!texture) return;
    if (!mask) {
      texture.clear();
      this.ready = true;
      this.deps.onChange();
      return;
    }
    this.ready = false;
    let image: Texture;
    try {
      image = await texture.decode(mask);
    } catch (error) {
      if (generation === this.loadGeneration) this.loadedMask = undefined;
      console.error('Atlas: could not load the explored areas of this scene', error);
      return;
    }
    let drawn = false;
    if (generation === this.loadGeneration) {
      this.deps.guard(() => {
        texture.draw(image);
        drawn = true;
        this.ready = true;
        this.deps.onChange();
      });
    }
    if (!drawn) image.destroy(true);
  }

  private save(): void {
    if (!this.texture || !this.ready || this.contextLost) return;
    this.loadedMask = saveExploredMask(this.texture.toCanvas());
    this.deps.store.getState().setExploredMask(this.loadedMask);
  }
}
