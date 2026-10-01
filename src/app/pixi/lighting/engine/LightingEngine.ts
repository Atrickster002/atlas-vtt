import { Container, Graphics, Matrix, Texture, type Renderer } from 'pixi.js';
import { exploredMemoryOn } from '../../../lighting/sceneLightingOptions';
import type { Sight } from '../../../vision/sight';
import { destroyTree } from '../../utils/destroyTree';
import { setBackBuffer } from './backBuffer';
import type { CapsuleField } from './CapsuleField';
import { createCompositeFilter, type CompositeFilter, type LightingMode } from './compositeFilter';
import { contextLost, glOf } from './gpu';
import { LightingWorld } from './LightingWorld';
import { describeShaderFailures, failedEngineShaders } from './shaderCheck';
import { SightMeshes } from './SightMeshes';
import type { EngineScene } from './types';

/**
 * Scene lighting, independent of the store: world-space caches (`LightingWorld`), sight meshes
 * and a bounds rectangle in one layer, lit by the composite filter. The world exists only while
 * lighting is enabled.
 *
 * The engine never takes its caller down. Before it draws on a context it asks the driver
 * whether its shaders link (`failedEngineShaders`); it draws nothing while the context is lost;
 * and an error thrown by a pass stops it for good (`failed`): the layer is hidden, the world and
 * the back buffer are released, and every later call does nothing. A restored context is only
 * noted in PIXI's runner; the world is rebuilt from the last scene at the engine's next call.
 */
export class LightingEngine {
  readonly layer = new Container({ label: 'lighting' });
  private readonly boundsRect = new Graphics();
  private readonly sightMeshes = new SightMeshes();
  private world: LightingWorld | null = null;
  private composite: CompositeFilter | null = null;
  private boundField: CapsuleField | null = null;
  private explored: Texture = Texture.EMPTY;
  private mode: LightingMode = 'gm';
  private view = { screenToWorld: new Matrix(), zoom: 1 };
  private sight: Sight | null = null;
  private scene: EngineScene | null = null;
  private enabled = false;
  private ownsBackBuffer = false;
  private stopped = false;
  /** The shaders link on the current context. */
  private verified = false;
  /** The context was restored: the world's textures are blank until it is rebuilt. */
  private stale = false;
  private restoreUnreported = false;
  // Rebuilding renders, and PIXI's other systems may not have their context back yet.
  private readonly contextListener = {
    contextChange: (): void => {
      this.stale = true;
      this.restoreUnreported = true;
    },
  };

  constructor(private readonly renderer: Renderer) {
    this.layer.eventMode = 'none';
    this.layer.addChild(this.boundsRect, this.sightMeshes.view);
    renderer.runners.contextChange.add(this.contextListener);
  }

  /** The engine cannot run on this graphics device; it draws nothing for the rest of its life. */
  get failed(): boolean {
    return this.stopped;
  }

  hasWorld(): boolean {
    return !!this.world;
  }

  /** True once after each restored context: the owner's own render textures came back blank too. */
  takeRestored(): boolean {
    const restored = this.restoreUnreported;
    this.restoreUnreported = false;
    return restored;
  }

  /** Does nothing while disabled: the next update after `setEnabled(true)` builds everything. */
  update(scene: EngineScene): void {
    if (!this.enabled || this.stopped) return;
    this.scene = scene;
    this.attempt(() => this.build(scene));
  }

  private build(scene: EngineScene): void {
    const { bounds } = scene;
    if (!this.world || this.world.bounds.width !== bounds.width || this.world.bounds.height !== bounds.height) {
      this.replaceWorld(new LightingWorld(this.renderer, bounds));
    }
    const world = this.world!;
    const composite = this.composite!;
    world.update(scene.walls, scene.lights, scene.albedo);
    if (world.fieldAll() !== this.boundField) {
      this.boundField = world.fieldAll();
      composite.setWorld(world);
    }
    if (scene.sight !== this.sight) {
      this.sight = scene.sight;
      this.sightMeshes.draw(scene.sight, scene.sightRadius);
      composite.setAllSeen(scene.sight.all);
    }
    composite.setAmbient(scene.ambient, scene.ambientColor);
    composite.setMemoryShown(exploredMemoryOn(scene));
    composite.setMemoryColours(scene.exploredColor, scene.unexploredColor);
  }

  /**
   * The one switch for the back buffer: the composite reads the scene beneath it, and without
   * one WebGL skips the composite and the layer shows the map unlit. The engine's owner calls
   * this, so nothing else turns the back buffer on or off behind its back. Disabling frees the
   * world textures (100–270 MB on large maps).
   */
  setEnabled(on: boolean): void {
    if (this.stopped) return;
    this.enabled = on;
    this.layer.visible = on;
    setBackBuffer(this.renderer, on);
    this.ownsBackBuffer = on;
    if (!on) this.dropWorld();
  }

  animate(now: number): boolean {
    return this.attempt(() => this.currentWorld()?.animate(now)) ?? false;
  }

  busy(): boolean {
    return this.world?.busy() ?? false;
  }

  flush(): void {
    this.attempt(() => this.currentWorld()?.flush());
  }

  /**
   * Stops the engine for good after an error on the graphics device, the engine's own or one
   * its owner met in lighting work beside it (explored memory).
   */
  fail(error: unknown): void {
    if (this.stopped) return;
    console.error('Atlas: dynamic lighting stopped after an error on the graphics device', error);
    this.stop();
  }

  setMode(mode: LightingMode): void {
    this.mode = mode;
    this.composite?.setMode(mode);
  }

  setView(screenToWorld: Matrix, zoom: number): void {
    this.view.screenToWorld.copyFrom(screenToWorld);
    this.view.zoom = zoom;
    this.composite?.setView(screenToWorld, zoom);
  }

  /** The caller owns `texture`; set its replacement before destroying it. */
  setExplored(texture: Texture): void {
    this.explored = texture;
    this.composite?.setExplored(texture);
  }

  destroy(): void {
    this.renderer.runners.contextChange.remove(this.contextListener);
    this.dropWorld();
    this.sightMeshes.destroy();
    destroyTree(this.layer);
    this.releaseBackBuffer();
  }

  /** Runs GPU work if the device can take it now; an error stops the engine instead of escaping. */
  private attempt<T>(work: () => T): T | undefined {
    if (this.stopped || !this.enabled) return undefined;
    try {
      return this.ready() ? work() : undefined;
    } catch (error) {
      this.fail(error);
      return undefined;
    }
  }

  /**
   * Whether the context is there and links the engine's shaders. After a restored context the
   * world goes (its textures are blank) and the shaders are checked again on the new one.
   */
  private ready(): boolean {
    if (contextLost(this.renderer)) return false;
    if (this.stale) {
      const scene = this.scene;
      this.dropWorld();
      this.scene = scene;
      this.stale = false;
      this.verified = false;
    }
    if (this.verified) return true;
    const gl = glOf(this.renderer);
    const failures = gl ? failedEngineShaders(gl) : [];
    // Lost while compiling: the logs say nothing about the device. Wait for the restore.
    if (contextLost(this.renderer)) return false;
    if (failures.length > 0) {
      console.error(`Atlas: dynamic lighting cannot run on this graphics device. These shaders did not compile:\n${describeShaderFailures(failures)}`);
      this.stop();
      return false;
    }
    this.verified = true;
    return true;
  }

  /** The world, rebuilt from the last scene when a restored context took it. */
  private currentWorld(): LightingWorld | null {
    if (!this.world && this.scene) this.build(this.scene);
    return this.world;
  }

  /** Leaves stage renders clean: no layer, no composite, no back buffer. */
  private stop(): void {
    this.stopped = true;
    this.enabled = false;
    this.layer.visible = false;
    try {
      this.dropWorld();
    } catch (error) {
      console.error('Atlas: could not release the lighting textures', error);
    }
    this.releaseBackBuffer();
  }

  private releaseBackBuffer(): void {
    if (this.ownsBackBuffer) setBackBuffer(this.renderer, false);
    this.ownsBackBuffer = false;
  }

  /** The composite goes with the world, so it never holds the world's destroyed textures. */
  private dropWorld(): void {
    this.layer.filters = null;
    this.composite?.filter.destroy();
    this.composite = null;
    this.boundField = null;
    this.world?.destroy();
    this.world = null;
    this.scene = null;
    this.sight = null;
  }

  /** The composite moves to the new world before the old one's textures are destroyed. */
  private replaceWorld(world: LightingWorld): void {
    const previous = this.world;
    this.world = world;
    this.boundField = world.fieldAll();
    if (this.composite) {
      this.composite.setWorld(world);
    } else {
      this.composite = createCompositeFilter(world, this.explored);
      this.composite.setMode(this.mode);
      this.composite.setView(this.view.screenToWorld, this.view.zoom);
      this.layer.filters = [this.composite.filter];
    }
    previous?.destroy();
    const { width, height } = world.bounds;
    // PIXI takes the filter area from the children's bounds: keep the whole map covered.
    this.boundsRect.clear().rect(0, 0, width, height).fill({ color: 0, alpha: 0 });
    this.sight = null;
  }
}
