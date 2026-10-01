import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { worldTexel } from '../../lighting/lightingConstants';
import { SightTokens, heldForSight } from '../../lighting/sightOnDrop';
import { SEES_ALL, SightCache, sceneSight, sightSources, type AmbientLight, type LightReach, type Sight } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import { seenSpots, type SeenSpot } from '../../vision/perception';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import { destroyTree } from '../utils/destroyTree';
import type { SceneFrame } from './engine/types';
import { LIGHTING_Z_INDEX } from './LightingRenderer';
import { PlayerView } from './PlayerView';
import type { SceneLightingView } from './sceneLightingView';

/** Full ambient light: everything in sight counts as lit. */
const FULL_DAYLIGHT: AmbientLight = { ambient: 1 };

export interface CanvasLightingDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  /** The senses and conditions of the map's collection; the generic ones without it. */
  rules?: () => SightRules;
  /** What the tokens see was worked out anew. */
  onSightChange?: () => void;
}

/**
 * Scene lighting without WebGL, which has no shaders: players still see nothing their tokens
 * cannot see (the map is black outside line of sight, unless the scene has token vision off),
 * but there is no light, shadow or explored memory, and everything in sight counts as lit
 * whatever the scene's lit threshold: without its lights, a dark scene would hide every token.
 * The GM's canvas is unchanged.
 */
// ponytail: overlapping sight polygons are cut as separate holes; earcut may darken their overlap. Union them if that shows.
export class CanvasLightingFallback implements SceneLightingView {
  readonly modeLayer: HideableLayer;
  private readonly darkness = new Graphics();
  private readonly cache = new SightCache();
  private readonly sightTokens = new SightTokens();
  private sight: Sight = SEES_ALL;
  private readonly playerView = new PlayerView((shown) => { this.darkness.visible = shown; });
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: CanvasLightingDeps) {
    this.darkness.zIndex = LIGHTING_Z_INDEX;
    this.darkness.eventMode = 'none';
    deps.viewport.addChild(this.darkness);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    this.update(deps.store.getState());
  }

  isEnabled(): boolean { return this.deps.store.getState().lighting.enabled; }
  currentSight(): Sight { return this.sight; }
  lightReaches(): LightReach[] { return []; }
  ambientLight(): AmbientLight { return FULL_DAYLIGHT; }
  refreshBounds(): void { this.update(this.deps.store.getState()); }
  resetExplored(): void { /* The fallback keeps no explored memory. */ }
  beforeMapUnload(): void { /* Nothing is pending in the fallback. */ }

  /** The GM's view is unlit, and so is its thumbnail: only the darkness of a players' view on the canvas is left out. */
  renderForFrame<T>(_frame: SceneFrame, render: () => T): T {
    const shown = this.darkness.visible;
    this.darkness.visible = false;
    try {
      return render();
    } finally {
      this.darkness.visible = shown;
    }
  }

  private update(state: ViewAtlasState): void {
    const bounds = this.deps.bounds();
    if (!state.lighting.enabled || !bounds) {
      this.darkness.clear();
      return;
    }
    const scale = unitScaleOf(this.deps.measurement(), state.grid);
    const walls = sealedWalls(wallList(state.objects.walls), worldTexel(bounds));
    const rules = this.deps.rules?.();
    const tokens = this.sightTokens.read(state);
    this.sight = sceneSight(state.lighting, sightSources(tokens, scale, bounds, rules), walls, this.cache);
    const spots = seenSpots(this.sight, FULL_DAYLIGHT, [], state.objects.tokens, scale.cellSize, { conditions: rules?.conditions ?? [], held: heldForSight(state) });
    this.drawDarkness(bounds, spots);
    this.deps.onSightChange?.();
  }

  /** Black over the map, cut open where a sense shows it and at each token seen without the map around it. */
  private drawDarkness(bounds: MapBounds, spots: readonly SeenSpot[]): void {
    const g = this.darkness;
    g.clear();
    if (this.sight.all) return;
    g.rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000 });
    for (const { sense, polygon } of this.sight.regions) {
      if (sense.reveals === 'all' && polygon && polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).cut();
    }
    for (const { x, y, radius } of spots) g.circle(x, y, radius).cut();
    this.darkness.visible = this.playerView.visible;
  }

  destroy(): void {
    this.unsubscribe();
    destroyTree(this.darkness);
  }
}
