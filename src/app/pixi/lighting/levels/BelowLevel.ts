import { Matrix, type Renderer, type RenderTexture } from 'pixi.js';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { levelImagePlacement } from '../../../levels/levelAlignment';
import { levelBackground } from '../../../levels/levelEdits';
import { levelObjectsOn } from '../../../levels/levelObjects';
import { exploredMaskOf, levelMapKey } from '../../../levels/sceneLevels';
import type { LevelStack } from '../../../levels/levelStack';
import { stampClip, type TexelMask } from '../../../levels/stackClip';
import { sameStretch } from '../../../grid/mapStretch';
import { sceneLook } from '../../../lighting/sceneLightingOptions';
import { withZones } from '../../../lighting/lightZones';
import type { TokenEntity } from '../../../types';
import type { LightingQuality } from '../../../lighting/lightingQuality';
import { exploredShapes } from '../../../vision/exploredShapes';
import { SceneModelBuilder, SceneSpots, type SceneModel } from '../../../vision/sceneModel';
import type { Sight } from '../../../vision/sight';
import type { SightRules } from '../../../vision/sightRules';
import { GM_SIGHT_POLICY } from '../../../vision/tokenSightPolicy';
import { SightBelow, type BelowSight } from '../../../vision/throughSight';
import type { MapBounds } from '../../../vision/visibility';
import type { MapImage } from '../../mapImage/MapImage';
import type { MapImageSource } from '../../mapImage/mapImageTypes';
import type { TileView } from '../../mapImage/levelOfDetail';
import { LightingEngine } from '../engine/LightingEngine';
import type { CompositeStack, LightingMode } from '../engine/compositeFilter';
import { ExploredMemory } from '../ExploredMemory';
import { exploredGrid } from '../ExploredTexture';
import type { LightingState, LightingStore } from '../LightingRenderer';
import { BelowFog } from './BelowFog';
import { BelowStage } from './BelowStage';
import { BelowTokens, type BelowTokenLook, type TokenArt } from './BelowTokens';

const DEFAULT_CELL_SIZE = 70;
/** How translucent the GM sees the committed fog of a level below, as on the level itself. */
const GM_FOG_ALPHA = 0.5;

/** What a level below needs of its map image (`MapImage`). */
export type BelowMapImage = Pick<MapImage, 'layer' | 'worldRect' | 'mapStretch' | 'load' | 'setStretch' | 'drawFor' | 'addDemandRegion' | 'destroy'>;

export interface BelowLevelDeps {
  id: string;
  renderer: Renderer;
  store: LightingStore;
  quality: LightingQuality;
  image: BelowMapImage;
  /** What a level's background is shown from (`mapImageSourceFor`). */
  mapSource: (background: string | null, gridSize: number | undefined) => MapImageSource;
  art: TokenArt;
  requestRender: () => void;
  /** The level's picture became ready, or stopped being: the stack must be worked out again. */
  onReady: () => void;
  guard: (work: () => void) => void;
}

/** What the picture of a level below is drawn for: a render of the view's, through its camera. */
export interface BelowFrame {
  /** World pixels to the render's points. */
  camera: Matrix;
  mode: LightingMode;
  /** The map's tiles that render shows, where it is not the view's own camera (the player window's frame). */
  tiles?: TileView | undefined;
}

/**
 * One level below the view, seen through the view's openings (`LevelsBelow`): its own map image,
 * tokens, fog, lighting (a second `LightingEngine` at a lower quality, off-screen) and explored
 * memory, all of that level, in the same world pixels as the view. What its engine draws as seen
 * is `sightBelow`: the view's lines of sight and the level's own tokens' sight.
 */
export class BelowLevel {
  readonly engine: LightingEngine;
  readonly stage: BelowStage;
  private readonly memory: ExploredMemory;
  private readonly tokens: BelowTokens;
  private readonly fog: BelowFog;
  private readonly builder = new SceneModelBuilder();
  private readonly spots = new SceneSpots();
  private readonly gmSpots = new SceneSpots(GM_SIGHT_POLICY);
  private readonly playerBelow = new SightBelow();
  private readonly gmBelow = new SightBelow();
  /** The background asked for, and the one whose image has loaded. */
  private wanted: string | null | undefined = undefined;
  private loaded: string | null | undefined = undefined;
  private model: SceneModel | null = null;
  /** What the memory last recorded of the view's sight through the openings. */
  private recorded: { sight: Sight; model: SceneModel; stack: LevelStack } | null = null;
  /** The memory texels the openings of `stack` show the level in (`stampClip`), kept while the stack and the map stay. */
  private clip: { stack: LevelStack; bounds: MapBounds; within: TexelMask | null } | null = null;
  /** What the rules read of the level: set once it is built. */
  private rule: Omit<BelowSight, 'stack' | 'index'> | null = null;
  private mode: LightingMode = 'gm';
  private destroyed = false;

  constructor(private readonly deps: BelowLevelDeps) {
    this.engine = new LightingEngine(deps.renderer, deps.quality, { levelIndex: 1, backBuffer: false });
    this.tokens = new BelowTokens(deps.art, deps.requestRender);
    this.fog = new BelowFog(deps.requestRender);
    this.memory = new ExploredMemory({
      renderer: deps.renderer,
      store: deps.store,
      onTexture: (texture) => {
        if (texture) this.engine.setExplored(texture);
      },
      onTravel: () => undefined,
      onChange: deps.requestRender,
      guard: deps.guard,
      edits: false,
    });
    this.stage = new BelowStage({ map: deps.image.layer, tokens: this.tokens.view, lighting: this.engine.layer, fog: this.fog.view });
  }

  get id(): string {
    return this.deps.id;
  }

  /** The level's map in world pixels once its image is the one asked for; null until then. */
  bounds(): MapBounds | null {
    if (this.wanted === undefined || this.loaded !== this.wanted) return null;
    const rect = this.deps.image.worldRect;
    return rect && rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
  }

  /** Its picture can be drawn: the image is in, and its engine has built a world. */
  ready(): boolean {
    return this.bounds() !== null && this.model !== null && this.engine.hasWorld();
  }

  /** Shows the level's own map, as the scene places it, loading it where another was shown. */
  followImage(state: LightingState): void {
    const background = levelBackground(state, this.deps.id);
    const placement = levelImagePlacement(state, this.deps.id);
    if (background === this.wanted) {
      if (this.loaded === background && !sameStretch(placement, this.deps.image.mapStretch)) this.deps.image.setStretch(placement);
      return;
    }
    this.wanted = background;
    void this.deps.image.load(this.deps.mapSource(background, state.grid?.size), placement).then(() => {
      if (this.destroyed || this.wanted !== background) return;
      this.loaded = background;
      this.deps.onReady();
    });
  }

  /**
   * Lights the level from the store, as a view of it would, and draws as seen what the view's
   * players and GM (`viewed`) see of it through the openings and what its own tokens see. Its
   * memory records what its tokens see (and `recordThrough` what the view sees of it).
   */
  update(state: LightingState, viewed: { sight: Sight; gmSight: Sight }, measurement: () => MeasurementSettings, rules?: () => SightRules): void {
    const bounds = this.bounds();
    if (!bounds) return;
    const id = this.deps.id;
    const seen = { ...state, viewedLevel: id };
    this.memory.sync(bounds, exploredMaskOf(state, id), id);
    const { model, rebuilt } = this.builder.update(seen, bounds, measurement, rules);
    this.model = model;
    if (rebuilt && model.explored) this.memory.record(model.explored);
    const own = model.gmSight ?? model.sight;
    const player = this.playerBelow.of(viewed.sight, model.sight);
    const gm = this.gmBelow.of(viewed.gmSight, own);
    const spots = this.spots.update(model, seen, measurement, rules);
    const gmSpots = own === model.sight ? spots : this.gmSpots.update(model, seen, measurement, rules, own);
    this.rule = { sight: player, ambient: model.ambient, reaches: model.reaches };
    this.engine.setEnabled(true);
    this.engine.update({
      bounds, walls: model.walls, lights: model.lights, albedo: null, zones: model.zones,
      sight: gm, spots: gmSpots, ...(gm !== player && { playerSight: player, playerSpots: spots }),
      sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5, ...sceneLook(state.lighting),
    });
    const objects = levelObjectsOn(state, id);
    this.tokens.sync(objects.tokens, state.grid?.size ?? DEFAULT_CELL_SIZE);
    this.fog.sync(objects.fog, bounds, levelMapKey(state.mapPath, seen));
  }

  /** What the rules read of the level from the view above, through `stack`; null until it is built. */
  belowSight(stack: LevelStack): BelowSight | null {
    return this.rule && { stack, index: 1, ...this.rule };
  }

  /** The level's committed fog as the rules read it (null: unreadable, which hides all). */
  fogCoverage(): ReturnType<BelowFog['coverage']> {
    return this.fog.coverage();
  }

  setStack(stack: CompositeStack | null): void {
    this.engine.setStack(stack);
  }

  /** Draws the level's picture for `frame` into `target`: its tokens as `look` says, its fog for the frame's mode. */
  draw(frame: BelowFrame, target: RenderTexture, look: (token: TokenEntity) => BelowTokenLook): void {
    if (frame.mode !== this.mode) {
      this.mode = frame.mode;
      this.engine.setMode(frame.mode);
    }
    const inverse = frame.camera.clone().invert();
    this.engine.setView(inverse, Math.hypot(frame.camera.a, frame.camera.b));
    this.tokens.show(look);
    this.fog.view.alpha = frame.mode === 'player' ? 1 : GM_FOG_ALPHA;
    const restore = frame.tiles ? this.deps.image.drawFor(frame.tiles) : null;
    try {
      this.stage.render(this.deps.renderer, target, frame.camera);
    } finally {
      restore?.();
    }
  }

  /** Flicker below: true where the level's light map changed. */
  animate(now: number): boolean {
    return this.engine.busy() && this.engine.animate(now);
  }

  /** The graphics context is lost: nothing its memory holds from now on is its memory. */
  holdSaves(): void {
    this.memory.holdSaves();
  }

  /**
   * The view is done with this level: its memory saves what is pending first (`flush`), unless what
   * it holds may be broken (a lost context, an engine that stopped).
   */
  destroy(flush: boolean): void {
    this.destroyed = true;
    if (flush) this.deps.guard(() => this.memory.beforeMapUnload());
    this.stage.release();
    this.engine.destroy();
    this.memory.destroy();
    this.tokens.destroy();
    this.fog.destroy();
    this.deps.image.destroy();
  }

  /** Keeps the tiles of `view` (the player window's frame) of the level's map loaded. */
  addDemandRegion(view: TileView): () => void {
    return this.deps.image.addDemandRegion(view);
  }

  /**
   * Records what the view's players see of the level through the openings (`sight`), within the
   * memory texels that touch only texels `stack` shows it in (`stampClip`), when that or the
   * level's light changed.
   */
  recordThrough(sight: Sight, stack: LevelStack, state: LightingState): void {
    const model = this.model;
    const bounds = this.bounds();
    if (!model || !bounds) return;
    const last = this.recorded;
    if (last?.sight === sight && last.model === model && last.stack === stack) return;
    this.recorded = { sight, model, stack };
    if (sight.all) return;
    const looking: Sight = { all: false, regions: sight.regions.filter((region) => region.polygon !== null) };
    const shapes = exploredShapes(looking, withZones(state.lighting, model.ambient.zones ?? []), model.reaches);
    const within = shapes && this.clipOf(stack, bounds);
    if (shapes && within) this.memory.record({ ...shapes, within });
  }

  /** The memory texels `stack` shows the level in, worked out once for the stack and the map. */
  private clipOf(stack: LevelStack, bounds: MapBounds): TexelMask | null {
    const kept = this.clip;
    if (kept?.stack === stack && kept.bounds.width === bounds.width && kept.bounds.height === bounds.height) return kept.within;
    const within = stampClip(stack, 1, { ...exploredGrid(bounds), mapWidth: bounds.width, mapHeight: bounds.height });
    this.clip = { stack, bounds, within };
    return within;
  }
}
