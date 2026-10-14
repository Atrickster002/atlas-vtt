import { Matrix, RenderTexture, type Container, type Renderer, type WebGLRenderer } from 'pixi.js';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { belowQuality, type LightingQuality } from '../../../lighting/lightingQuality';
import { levelObjects, levelObjectsOn } from '../../../levels/levelObjects';
import { levelStack, levelsBelow, levelsShownBelow, stackGrid, type LevelStack, type StackLevel } from '../../../levels/levelStack';
import { levelSurfaceList } from '../../../levels/levelSurfaces';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import type { TokenEntity } from '../../../types';
import type { Sight } from '../../../vision/sight';
import type { SightRules } from '../../../vision/sightRules';
import { belowTokenPerception, type FogCover } from '../../../vision/throughSight';
import { PerceptionMemo, type TokenPerception } from '../../../vision/tokenPerception';
import type { MapBounds } from '../../../vision/visibility';
import { HIDDEN_TOKEN_ALPHA } from '../../playerSafeFrame';
import type { MapImageSource } from '../../mapImage/mapImageTypes';
import type { TileView } from '../../mapImage/levelOfDetail';
import type { LightingEngine } from '../engine/LightingEngine';
import type { LightingMode } from '../engine/compositeFilter';
import type { LightingState, LightingStore } from '../LightingRenderer';
import { heldForSight } from '../../../lighting/sightOnDrop';
import { BelowLevel, type BelowMapImage } from './BelowLevel';
import type { TokenArt } from './BelowTokens';
import { LevelStackTexture } from './LevelStackTexture';

/** How dark the GM sees a level below through an opening: never mistaken for the floor the view shows. */
export const BELOW_GM_DIM = 0.6;
/** How dark the players see it: a depth cue, never brighter than the level itself. */
export const BELOW_PLAYER_DIM = 0.85;

/** What a view gives its levels below that the lighting cannot make itself. */
export interface BelowLevelsHost {
  /** A map image for a level below, drawn with the view's camera and never changing the view's world (`belowMapImage`). */
  createMapImage(): BelowMapImage;
  /** What a level's background is shown from (`mapImageSourceFor`). */
  mapSource(background: string | null, gridSize: number | undefined): MapImageSource;
  /** Token art for the tokens of a level below. */
  createArt(): TokenArt;
  /** The committed fog of the level the view shows (null: unreadable, which hides all). */
  viewedFog(): FogCover;
  /** Puts the openings' eraser into the view's stage, between its grid and its tokens. */
  placeEraser(eraser: Container): void;
}

export interface LevelsBelowDeps {
  renderer: Renderer;
  store: LightingStore;
  host: BelowLevelsHost;
  /** The quality the view itself is lit at; levels below take one a tier lower (`belowQuality`). */
  quality: () => LightingQuality;
  measurement: () => MeasurementSettings;
  rules?: () => SightRules;
  /** The view's own engine: its composite shows the levels below through the openings. */
  view: LightingEngine;
  requestRender: () => void;
  /** Something the stack depends on came in (a level's image): the view's lighting updates. */
  onReady: () => void;
  guard: (work: () => void) => void;
}

/** A render of the view the levels below are drawn for: one each for the canvas and the player window's frame. */
export interface BelowPicture {
  key: 'canvas' | 'frame';
  /** World pixels to the render's points. */
  camera: Matrix;
  /** The render's size in points, and its pixels per point. */
  width: number;
  height: number;
  resolution: number;
  mode: LightingMode;
  /** The map's tiles the render shows, where it is not the view's own camera. */
  tiles?: TileView | undefined;
}

/**
 * The levels below a view seen through its openings (phase 4a: the nearest one the viewed level
 * sees): the level stack the rules and the picture read, the eraser that opens the view's map,
 * and one `BelowLevel` for each level drawn. Before each render of the view (`prepare`), each
 * level's stage is rendered into a texture of that render's size, through that render's camera,
 * and handed to the view's composite, which takes from it texel on pixel where the stack shows
 * that level. Nothing is drawn while no opening is in the picture, and a level shows nothing until
 * its picture is ready.
 */
export class LevelsBelow {
  private readonly levels = new Map<string, BelowLevel>();
  private readonly stackTexture = new LevelStackTexture();
  private readonly targets = new Map<BelowPicture['key'], RenderTexture>();
  private readonly regions = new Map<TileView, Map<string, () => void>>();
  private readonly perceptions = new PerceptionMemo();
  private stack: LevelStack | null = null;
  private stackInputs: readonly unknown[] = [];
  private eraserPlaced = false;

  constructor(private readonly deps: LevelsBelowDeps) {}

  /** Whether the lighting of a level below stopped on this graphics device: the view's stops with it. */
  failed(): boolean {
    for (const level of this.levels.values()) if (level.engine.failed) return true;
    return false;
  }

  /** The level stack of the view, or null while it shows only its own level. */
  currentStack(): LevelStack | null {
    return this.stack;
  }

  /**
   * Lets go of the levels the view no longer draws, saving what their memories hold first: before
   * the view's own memory takes up one of them (the view went down a level), which would otherwise
   * write the same level twice.
   */
  drop(state: LightingState): void {
    const keep = new Set(this.wanted(state));
    for (const [id, level] of this.levels) {
      if (keep.has(id)) continue;
      this.levels.delete(id);
      this.releaseRegions(id);
      level.destroy(true);
    }
  }

  /** Follows the scene: the levels drawn below, their lighting from the view's sight, and the stack. */
  update(state: LightingState, viewBounds: MapBounds, viewed: { sight: Sight; gmSight: Sight }): void {
    this.drop(state);
    const wanted = this.wanted(state);
    for (const id of wanted) {
      const level = this.levels.get(id) ?? this.add(id);
      level.followImage(state);
      level.update(state, viewed, this.deps.measurement, this.deps.rules);
    }
    // Once the levels are lit: a level counts in the stack from the update that gave it its world.
    const stack = this.buildStack(state, viewBounds, wanted);
    this.bind(stack);
    if (stack) for (const id of wanted) this.levels.get(id)!.recordThrough(viewed.sight, stack, state);
  }

  /** How the players perceive the tokens of the level below drawn, from the view above; everything unseen without one. */
  tokenPerception(state: LightingState): TokenPerception {
    const stack = this.stack;
    const [level] = this.levels.values();
    const below = stack && level?.ready() ? level.belowSight(stack) : null;
    if (!below || !level) return () => 'unseen';
    const tokens = levelObjectsOn(state, level.id).tokens;
    return belowTokenPerception(below, tokens, { viewed: this.deps.host.viewedFog(), below: level.fogCoverage() },
      { conditions: this.deps.rules?.().conditions ?? [], held: heldForSight(state) }, this.perceptions);
  }

  /**
   * Draws the levels below for a render of the view about to be drawn, and hands them to the view's
   * composite; where no opening shows a ready level in that render, none, and its texels show nothing.
   */
  prepare(picture: BelowPicture): void {
    const { view } = this.deps;
    const stack = this.stack;
    const [level] = this.levels.values();
    if (!stack || !level?.ready() || !this.inPicture(stack, picture) || !this.canBlend()) {
      view.setBelow(null, 1);
      return;
    }
    const target = this.targetFor(picture);
    const state = this.deps.store.getState();
    const perception = picture.mode === 'player' ? this.tokenPerception(state) : null;
    level.draw({ camera: picture.camera, mode: picture.mode, tiles: picture.tiles }, target, (token: TokenEntity) => {
      if (!perception) return { visible: true, alpha: token.isHidden ? HIDDEN_TOKEN_ALPHA : 1 };
      return perception(token.id) === 'seen' ? { visible: true, alpha: 1 } : { visible: false };
    });
    view.setBelow(target, picture.mode === 'player' ? BELOW_PLAYER_DIM : BELOW_GM_DIM);
  }

  /** Flicker below and changes on the levels' stages ask for a render while an opening shows them. */
  animate(now: number): void {
    if (!this.stack?.box) return;
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

  /** The graphics context is lost: what the memories below hold from now on is not their memory. */
  holdSaves(): void {
    for (const level of this.levels.values()) level.holdSaves();
  }

  /** Every level below goes, its memory saved first where `flush` (the map unloads) and dropped otherwise (a restored context, a stop). */
  reset(flush: boolean): void {
    this.bind(null);
    for (const [id, level] of this.levels) {
      this.releaseRegions(id);
      level.destroy(flush);
    }
    this.levels.clear();
    this.stack = null;
    this.stackInputs = [];
  }

  destroy(flush = false): void {
    this.reset(flush);
    for (const target of this.targets.values()) target.destroy(true);
    this.targets.clear();
    this.stackTexture.destroy();
  }

  /** The levels below the view draws: none in a scene of one level or while the viewed level has no opening. */
  private wanted(state: LightingState): string[] {
    const viewed = viewedLevelId(state);
    if (!hasLevels(state.levels) || viewed === null) return [];
    if (!levelSurfaceList(levelObjects(state).levelSurfaces).some((surface) => surface.open)) return [];
    return levelsShownBelow(state.levels, viewed);
  }

  private add(id: string): BelowLevel {
    const { deps } = this;
    const level = new BelowLevel({
      id,
      renderer: deps.renderer,
      store: deps.store,
      quality: belowQuality(deps.quality()),
      image: deps.host.createMapImage(),
      mapSource: (background, gridSize) => deps.host.mapSource(background, gridSize),
      art: deps.host.createArt(),
      requestRender: deps.requestRender,
      onReady: deps.onReady,
      guard: deps.guard,
    });
    this.levels.set(id, level);
    for (const [view, releases] of this.regions) releases.set(id, level.addDemandRegion(view));
    return level;
  }

  private releaseRegions(id: string): void {
    for (const releases of this.regions.values()) {
      releases.get(id)?.();
      releases.delete(id);
    }
  }

  /** The stack from the scene, worked out again only when what it is made of changed. */
  private buildStack(state: LightingState, viewBounds: MapBounds, wanted: readonly string[]): LevelStack | null {
    const viewed = viewedLevelId(state);
    if (wanted.length === 0 || viewed === null || !state.levels) {
      this.stack = null;
      this.stackInputs = [];
      return null;
    }
    const below = levelsBelow(state.levels, viewed);
    const ready = wanted.filter((id) => this.levels.get(id)?.ready());
    const bounds = ready.map((id) => this.levels.get(id)!.bounds());
    const surfaces = [levelObjects(state).levelSurfaces, ...below.map((level) => levelObjectsOn(state, level.id).levelSurfaces)];
    const inputs = [state.levels, viewed, viewBounds.width, viewBounds.height, ...surfaces, ...ready, ...bounds.flatMap((rect) => [rect?.width, rect?.height])];
    if (this.stack && inputs.length === this.stackInputs.length && inputs.every((input, i) => input === this.stackInputs[i])) return this.stack;
    this.stackInputs = inputs;
    const levelOf = (id: string, index: number): StackLevel => ({
      id,
      surfaces: levelSurfaceList(surfaces[index]),
      pictured: ready.includes(id) ? this.levels.get(id)!.bounds() ?? undefined : undefined,
    });
    this.stack = levelStack(levelOf(viewed, 0), below.map((level, i) => levelOf(level.id, i + 1)), ready, stackGrid(viewBounds));
    return this.stack;
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

  /** Whether the picture shows any texel of the stack that is not the viewed level. */
  private inPicture(stack: LevelStack, picture: BelowPicture): boolean {
    const box = stack.box;
    if (!box) return false;
    const inverse = picture.camera.clone().invert();
    const corners = [[0, 0], [picture.width, 0], [0, picture.height], [picture.width, picture.height]].map(([x, y]) => inverse.apply({ x: x!, y: y! }));
    const { texel } = stack.grid;
    const [minX, maxX] = [Math.min(...corners.map((p) => p.x)), Math.max(...corners.map((p) => p.x))];
    const [minY, maxY] = [Math.min(...corners.map((p) => p.y)), Math.max(...corners.map((p) => p.y))];
    return maxX >= box.x * texel && minX <= (box.x + box.columns) * texel && maxY >= box.y * texel && minY <= (box.y + box.rows) * texel;
  }

  /**
   * PIXI draws a filter that reads the scene beneath it only through the back buffer, also into a
   * texture: without it the level below's composite would be skipped and its map show unlit.
   */
  private canBlend(): boolean {
    const { renderer } = this.deps;
    return renderer.name === 'webgl' && (renderer as WebGLRenderer).backBuffer.useBackBuffer;
  }

  /** The texture a picture's levels below are drawn into: its size and pixels, kept while they stay. */
  private targetFor({ key, width, height, resolution }: BelowPicture): RenderTexture {
    const current = this.targets.get(key);
    const [pixelWidth, pixelHeight] = [Math.max(1, Math.round(width * resolution)), Math.max(1, Math.round(height * resolution))];
    if (current && current.source.pixelWidth === pixelWidth && current.source.pixelHeight === pixelHeight && current.source.resolution === resolution) return current;
    // The composite must not hold a texture that is gone.
    this.deps.view.setBelow(null, 1);
    current?.destroy(true);
    const target = RenderTexture.create({ width: pixelWidth / resolution, height: pixelHeight / resolution, resolution, antialias: false, scaleMode: 'nearest' });
    this.targets.set(key, target);
    return target;
  }

  /** The picture's textures go once nobody is shown it (the player window closed). */
  releasePicture(key: BelowPicture['key']): void {
    const target = this.targets.get(key);
    if (!target) return;
    this.deps.view.setBelow(null, 1);
    target.destroy(true);
    this.targets.delete(key);
  }
}
