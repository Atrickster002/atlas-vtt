import type { MeasurementSettings } from '../../grid/measurementFormat';
import { worldTexel } from '../../lighting/lightingConstants';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { SightTokens } from '../../lighting/sightOnDrop';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import type { SceneLighting } from '../../types/lightingTypes';
import type { WallSegment } from '../../types/wallTypes';
import { exploredShapes, type ExploredShapes } from '../../vision/exploredShapes';
import { seenSpots, type SeenSpot } from '../../vision/perception';
import type { SightRules } from '../../vision/sightRules';
import { SightCache, sceneSight, sightOptionsChanged, sightSources, type LightReach, type Sight } from '../../vision/sight';
import type { MapBounds } from '../../vision/visibility';
import { wallList } from '../../vision/wallList';
import type { EngineLight } from './engine/types';
import { LightReaches } from './lightReaches';
import { activeLights, engineLight } from './lightSources';

/** What a scene's lighting works out on the CPU, in world pixels: the engine draws it and the rules read it. */
export interface SceneModel {
  /** The drawn walls followed by the bridges that close their joints (`sealedWalls`). */
  walls: readonly WallSegment[];
  lights: EngineLight[];
  reaches: LightReach[];
  sight: Sight;
  /** Tokens seen where no sense shows the map, each shown within its footprint (`seenSpots`). */
  spots: SeenSpot[];
  /** What the tokens see now, for explored memory to record; null when nothing is recorded. */
  explored: ExploredShapes | null;
}

type SceneState = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'heldTokens'>;

interface Built {
  walls: ViewAtlasState['objects']['walls'];
  lights: ViewAtlasState['objects']['lights'];
  tokens: Record<string, TokenEntity>;
  grid: ViewAtlasState['grid'];
  lighting: SceneLighting;
  rules: SightRules | undefined;
  model: SceneModel;
}

/**
 * A scene's lights, their reaches and its sight, worked out from the store and again only when
 * what they are built from changes: the walls, the placed lights, the grid, the sight options,
 * the sight rules of the map's collection and the tokens as sight and light read them (`SightTokens`: a dragged token stands where its
 * drag began until the drop, so a drag builds nothing).
 */
export class SceneModelBuilder {
  private readonly sightTokens = new SightTokens();
  private readonly sightCache = new SightCache();
  private readonly lightReaches = new LightReaches();
  private built: Built | null = null;

  /** The model of `state`, and whether this call built it anew. */
  update(state: SceneState, bounds: MapBounds, measurement: () => MeasurementSettings, sightRules?: () => SightRules): { model: SceneModel; rebuilt: boolean } {
    const { walls, lights } = state.objects;
    const { grid, lighting } = state;
    const tokens = this.sightTokens.read(state);
    const rules = sightRules?.();
    const last = this.built;
    if (last && last.walls === walls && last.lights === lights && last.tokens === tokens && last.grid === grid && last.rules === rules) {
      const same = !sightOptionsChanged(last.lighting, lighting);
      // The lighting is noted either way: the next update compares with it, not with an older one.
      last.lighting = lighting;
      if (same) return { model: last.model, rebuilt: false };
    }
    const model = this.build(state, tokens, bounds, measurement(), rules);
    this.built = { walls, lights, tokens, grid, lighting, rules, model };
    return { model, rebuilt: true };
  }

  /** The next update builds anew, whatever changed: the map's size did, or lighting was off meanwhile. */
  reset(): void {
    this.built = null;
  }

  private build(state: SceneState, tokens: Record<string, TokenEntity>, bounds: MapBounds, measurement: MeasurementSettings, rules: SightRules | undefined): SceneModel {
    const scale = unitScaleOf(measurement, state.grid);
    const walls = sealedWalls(wallList(state.objects.walls), worldTexel(bounds));
    const lights = activeLights(state.objects.lights, tokens).map((light) => engineLight(light, scale));
    const reaches = this.lightReaches.sync(lights, walls);
    const sight = sceneSight(state.lighting, sightSources(tokens, scale, bounds, rules), walls, this.sightCache);
    const spots = seenSpots(sight, state.lighting, reaches, tokens, rules?.conditions ?? [], scale.cellSize);
    return { walls, lights, reaches, sight, spots, explored: exploredShapes(sight, state.lighting, reaches) };
  }
}
