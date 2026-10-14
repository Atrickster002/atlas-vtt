import { Matrix, type Application, type Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { belowQuality, type LightingQuality } from '../../../lighting/lightingQuality';
import { heldForSight } from '../../../lighting/sightOnDrop';
import { levelObjectsOn } from '../../../levels/levelObjects';
import type { LevelStack } from '../../../levels/levelStack';
import type { TokenEntity } from '../../../types';
import type { Sight } from '../../../vision/sight';
import type { SightRules } from '../../../vision/sightRules';
import { belowTokenPerception, type FogCover } from '../../../vision/throughSight';
import { PerceptionMemo, type TokenPerception } from '../../../vision/tokenPerception';
import type { MapBounds } from '../../../vision/visibility';
import type { TileView } from '../../mapImage/levelOfDetail';
import { HIDDEN_TOKEN_ALPHA } from '../../playerSafeFrame';
import { addBeforeRender, BEFORE_RENDER_ORDER } from '../../RenderScheduler';
import type { LightingMode } from '../engine/compositeFilter';
import type { LightingEngine } from '../engine/LightingEngine';
import type { LightingState, LightingStore } from '../LightingRenderer';
import { BelowLevel, type BelowMapImage } from './BelowLevel';
import { BelowPictures, type BelowPicture } from './BelowPictures';
import type { TokenArt } from './BelowTokens';
import { BelowStackBuilder, wantedBelow } from './belowStackBuilder';
import { LevelStackTexture } from './LevelStackTexture';

export type { BelowPicture } from './BelowPictures';

/** How dark the GM sees a level below through an opening: never mistaken for the floor the view shows. */
export const BELOW_GM_DIM = 0.6;
/** How dark the players see it: a depth cue, never brighter than the level itself. */
export const BELOW_PLAYER_DIM = 0.85;
/** How often a drag records what the view sees through the openings into the memory below. */
const RECORD_WHILE_DRAGGING_MS = 100;

/** What a view gives its levels below that the lighting cannot make itself. */
export interface BelowLevelsHost {
  /** A map image for a level below, drawn with the view's camera and never changing the view's world (`belowMapImage`). */
  createMapImage(): BelowMapImage;
  /** Token art for the tokens of a level below. */
  createArt(): TokenArt;
  /** The committed fog of the level the view shows (null: unreadable, which hides all). */
  viewedFog(): FogCover;
  /** Puts the openings' eraser into the view's stage, between its grid and its tokens. */
  placeEraser(eraser: Container): void;
}

export interface LevelsBelowDeps {
  app: Application;
  /** The view's camera: the canvas's own picture is drawn through it. */
  viewport: Viewport;
  store: LightingStore;
  host: BelowLevelsHost;
  /** The quality the view itself is lit at; levels below take one a tier lower (`belowQuality`). */
  quality: () => LightingQuality;
  measurement: () => MeasurementSettings;
  rules?: () => SightRules;
  /** The view's own engine: its composite shows the levels below through the openings. */
  view: LightingEngine;
  /** Which view the canvas shows now: the players' (session view, the peek) or the GM's. */
  mode: () => LightingMode;
  requestRender: () => void;
  /** Something the stack depends on came in (a level's image): the view's lighting updates. */
  onReady: () => void;
  guard: (work: () => void) => void;
}

/**
 * The levels below a view seen through its openings (phase 4a: the nearest one the viewed level
 * sees): the level stack the rules and the picture read, the eraser that opens the view's map,
 * and one `BelowLevel` for each level drawn. Before each render of the view, each level's stage is
 * rendered into a texture of that render's size, through that render's camera, and handed to the
 * view's composite, which takes from it texel on pixel where the stack shows that level: for the
 * canvas in a before-render hook that runs after the player window's frame took its own
 * (`BEFORE_RENDER_ORDER`), for the player window's frame through `prepare`. Nothing is drawn while no
 * opening is in the picture, and a level shows nothing until its picture is ready.
 */
export class LevelsBelow {
  private readonly levels = new Map<string, BelowLevel>();
  private readonly stackTexture = new LevelStackTexture();
  private readonly stacks = new BelowStackBuilder();
  private readonly pictures: BelowPictures;
  private readonly regions = new Map<TileView, Map<string, () => void>>();
  private readonly perceptions = new PerceptionMemo();
  private readonly stopPreparing: () => void;
  private eraserPlaced = false;
  /** When what the view sees through the openings was last recorded. */
  private recordedAt = -Infinity;

  constructor(private readonly deps: LevelsBelowDeps) {
    this.pictures = new BelowPictures(deps.app.renderer, () => deps.view.setBelow(null, 1));
    this.stopPreparing = addBeforeRender(deps.app, () => deps.guard(() => this.prepareCanvas()), BEFORE_RENDER_ORDER.levelsBelow);
  }

  /** Whether the lighting of a level below stopped on this graphics device: the view's stops with it. */
  failed(): boolean {
    for (const level of this.levels.values()) if (level.engine.failed) return true;
    return false;
  }

  /** The level stack of the view, or null while it shows only its own level. */
  currentStack(): LevelStack | null {
    return this.stacks.current();
  }

  /**
   * Lets go of the levels the view no longer draws, saving what their memories hold first: before
   * the view's own memory takes up one of them (the view went down a level), which would otherwise
   * write the same level twice.
   */
  drop(state: LightingState): void {
    const keep = new Set(wantedBelow(state));
    for (const [id, level] of [...this.levels]) {
      if (!keep.has(id)) this.remove(id, level, true);
    }
  }

  /** Follows the scene: the levels drawn below, their lighting from the view's sight, and the stack. */
  update(state: LightingState, viewBounds: MapBounds, viewed: { sight: Sight; gmSight: Sight }): void {
    this.drop(state);
    const wanted = wantedBelow(state);
    for (const id of wanted) {
      const level = this.levels.get(id) ?? this.add(id);
      level.followImage(state);
      level.update(state, viewed, this.deps.measurement, this.deps.rules);
    }
    // Once the levels are lit: a level counts in the stack from the update that gave it its world.
    const stack = this.stacks.build(state, viewBounds, wanted, (id) => this.levels.get(id));
    this.bind(stack);
    if (stack && this.mayRecord(state)) for (const id of wanted) this.levels.get(id)!.recordThrough(viewed.sight, stack, state);
  }

  /**
   * Whether what the view sees through the openings is recorded now: always, except while the
   * pointer drags tokens, then at most every `RECORD_WHILE_DRAGGING_MS` (a stamp costs about as much
   * as the rest of a drag step); the drop records where they came to stand.
   */
  private mayRecord(state: LightingState): boolean {
    const now = performance.now();
    if (Object.keys(state.heldTokens).length > 0 && now - this.recordedAt < RECORD_WHILE_DRAGGING_MS) return false;
    this.recordedAt = now;
    return true;
  }

  /** How the players perceive the tokens of the level below drawn, from the view above; everything unseen without one. */
  tokenPerception(state: LightingState): TokenPerception {
    const stack = this.stacks.current();
    const [level] = this.levels.values();
    const below = stack && level?.ready() ? level.belowSight(stack) : null;
    if (!below || !level) return () => 'unseen';
    const tokens = levelObjectsOn(state, level.id).tokens;
    return belowTokenPerception(below, tokens, { viewed: this.deps.host.viewedFog(), below: level.fogCoverage() },
      { conditions: this.deps.rules?.().conditions ?? [], held: heldForSight(state) }, this.perceptions);
  }

  /**
   * Draws the levels below for a render of the view about to be drawn through the camera the
   * viewport holds now (the player window's frame; without `picture`, the canvas's own), and hands
   * them to the view's composite; where no opening shows a ready level in it, none, and its texels show nothing.
   */
  prepare(picture?: Omit<BelowPicture, 'camera'>): void {
    if (picture) this.draw({ ...picture, camera: this.camera() });
    else this.prepareCanvas();
  }

  /** Flicker below and changes on the levels' stages ask for a render while an opening shows them. */
  animate(now: number): void {
    if (!this.stacks.current()?.box) return;
    let changed = false;
    for (const level of this.levels.values()) {
      if (level.animate(now) || level.stage.hasChanges()) changed = true;
    }
    if (changed) this.deps.requestRender();
  }

  /** Keeps the tiles of `view` (the player window's frame) of every level below loaded, as the view's own map does. */
  addDemandRegion(view: TileView): () => void {
    const releases = new Map<string, () => void>();
    this.regions.set(view, releases);
    for (const level of this.levels.values()) releases.set(level.id, level.addDemandRegion(view));
    return (): void => {
      this.regions.delete(view);
      for (const release of releases.values()) release();
    };
  }

  /** The player window's frame is no longer drawn: its texture goes. */
  releasePicture(key: BelowPicture['key']): void {
    this.pictures.release(key);
  }

  /** The graphics context is lost: what the memories below hold from now on is not their memory. */
  holdSaves(): void {
    for (const level of this.levels.values()) level.holdSaves();
  }

  /** Every level below goes, its memory saved first where `flush` (the map unloads) and dropped otherwise (a restored context, a stop). */
  reset(flush: boolean): void {
    this.bind(null);
    for (const [id, level] of [...this.levels]) this.remove(id, level, flush);
    this.stacks.reset();
  }

  destroy(): void {
    this.stopPreparing();
    this.reset(false);
    this.pictures.destroy();
    this.stackTexture.destroy();
  }

  /** The canvas's own render: its size, its pixels, and the view it shows now. */
  private prepareCanvas(): void {
    const { renderer } = this.deps.app;
    this.draw({ key: 'canvas', camera: this.camera(), width: renderer.screen.width, height: renderer.screen.height, resolution: renderer.resolution, mode: this.deps.mode() });
  }

  private draw(picture: BelowPicture): void {
    const { view } = this.deps;
    const stack = this.stacks.current();
    const [level] = this.levels.values();
    if (!stack || !level?.ready() || !this.pictures.shows(stack, picture) || !this.pictures.canBlend()) {
      view.setBelow(null, 1);
      return;
    }
    const target = this.pictures.targetFor(picture);
    const perception = picture.mode === 'player' ? this.tokenPerception(this.deps.store.getState()) : null;
    level.draw({ camera: picture.camera, mode: picture.mode, tiles: picture.tiles }, target, (token: TokenEntity) => {
      if (!perception) return { visible: true, alpha: token.isHidden ? HIDDEN_TOKEN_ALPHA : 1 };
      return perception(token.id) === 'seen' ? { visible: true, alpha: 1 } : { visible: false };
    });
    view.setBelow(target, picture.mode === 'player' ? BELOW_PLAYER_DIM : BELOW_GM_DIM);
  }

  /** World pixels to the points of the render about to be drawn: the viewport's transform now. */
  private camera(): Matrix {
    const { viewport } = this.deps;
    return new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
  }

  private add(id: string): BelowLevel {
    const { deps } = this;
    const level = new BelowLevel({
      id,
      renderer: deps.app.renderer,
      store: deps.store,
      quality: belowQuality(deps.quality()),
      image: deps.host.createMapImage(),
      art: deps.host.createArt(),
      requestRender: deps.requestRender,
      onReady: deps.onReady,
      guard: deps.guard,
    });
    this.levels.set(id, level);
    for (const [view, releases] of this.regions) releases.set(id, level.addDemandRegion(view));
    return level;
  }

  private remove(id: string, level: BelowLevel, flush: boolean): void {
    this.levels.delete(id);
    for (const releases of this.regions.values()) {
      releases.get(id)?.();
      releases.delete(id);
    }
    level.destroy(flush);
  }

  /** Hands the stack to every composite, then places the eraser in the view's stage the first time there is one. */
  private bind(stack: LevelStack | null): void {
    this.stackTexture.update(stack, (bound) => {
      this.deps.view.setStack(bound);
      for (const level of this.levels.values()) level.setStack(bound);
    });
    if (stack?.box && !this.eraserPlaced) {
      this.deps.host.placeEraser(this.stackTexture.eraser);
      this.eraserPlaced = true;
    }
  }
}
