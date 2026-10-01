import type { Renderer, Texture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { BOUNCE, FLICKER_INTERVAL_MS, LIGHT_REACH, tileWallReach, wallRadius, worldTexel } from '../../../lighting/lightingConstants';
import { changedWallRects } from '../../../lighting/wallChanges';
import { allSegments, splitBlocking, type Rect } from '../../../lighting/segments';
import type { MapBounds } from '../../../vision/visibility';
import { LightFlicker, STEADY, type FlickerSample } from '../lightFlicker';
import { CapsuleField } from './CapsuleField';
import { DarknessMap, type PierceShape } from './DarknessMap';
import { LightMap, type DrawnLight } from './LightMap';
import { RadianceCascades } from './RadianceCascades';
import { TileCache } from './TileCache';
import type { EngineLight } from './types';

/**
 * Everything the lighting keeps in world space for one map: the wall field, each light's tile,
 * the light map, the bounce and, once the map has a darkness source, the darkness map.
 * Independent of any camera; rebuilt only for what changed.
 * Constructing it draws nothing: the first `update` builds every texture.
 */
export class LightingWorld {
  readonly texel: number;
  readonly wallRadius: number;
  /** Two-way walls: what every light's tile is traced through. */
  readonly field: CapsuleField;
  readonly lightMap: LightMap;
  readonly cascades: RadianceCascades;
  /**
   * Two-way and one-way walls, created with the first one-way wall and then kept (idle while
   * there are none), so the composite never holds a destroyed field.
   */
  private allField: CapsuleField | null = null;
  private hasOneWay = false;
  /** Created with the first darkness source and then kept, so the composite never holds a destroyed texture. */
  private darkness: DarknessMap | null = null;
  private pierce: readonly PierceShape[] = [];
  private readonly tiles: TileCache;
  private readonly flicker = new LightFlicker();
  private walls: readonly WallSegment[] | null = null;
  private lights: readonly EngineLight[] = [];
  private albedo: Texture | null = null;
  private bounceDirty = false;
  private lastBounce = -Infinity;
  /** When the light map last took its flicker; -Infinity while it holds the steady lights. */
  private lastFlicker = -Infinity;

  constructor(private readonly renderer: Renderer, readonly bounds: MapBounds) {
    this.texel = worldTexel(bounds);
    this.wallRadius = wallRadius(this.texel);
    this.field = this.createField();
    this.lightMap = new LightMap(renderer, bounds, this.texel);
    this.cascades = new RadianceCascades(renderer, bounds, this.field);
    this.tiles = new TileCache(renderer, this.field, bounds);
  }

  /** The field with one-way walls too, which bounce and sight treat as blocking both ways. */
  fieldAll(): CapsuleField {
    return this.hasOneWay ? this.allField! : this.field;
  }

  /** The darkness map while the scene has a darkness source: the composite reads it only then. */
  darknessMap(): DarknessMap | null {
    return this.lights.some((light) => light.darkness) ? this.darkness : null;
  }

  /**
   * `pierce` is what the senses that see in magical darkness perceive (`pierceShapes`), the same
   * list while nothing changed; it is drawn into the darkness map, so it costs nothing on a map
   * without a darkness source.
   */
  update(walls: readonly WallSegment[], lights: readonly EngineLight[], albedo: Texture | null, pierce: readonly PierceShape[] = this.pierce): void {
    const pierceChanged = pierce !== this.pierce;
    this.pierce = pierce;
    let changed: Rect[] | 'all' = [];
    if (walls !== this.walls) {
      changed = this.walls ? changedWallRects(this.walls, walls, tileWallReach(this.texel)) : 'all';
      this.walls = walls;
      if (changed === 'all' || changed.length > 0) {
        this.rebuildFields(walls);
        this.bounceDirty = true;
      }
    }
    const tilesChanged = this.tiles.sync(lights, walls, changed);
    const lightsChanged = !sameLights(this.lights, lights);
    if (lightsChanged) this.forgetRemoved(lights);
    this.lights = lights;
    if (tilesChanged || lightsChanged) {
      this.drawSteady();
      this.bounceDirty = true;
    } else if (pierceChanged && this.darknessMap()) {
      this.drawDarkness();
    }
    if (albedo !== this.albedo) {
      this.albedo = albedo;
      this.bounceDirty = true;
    }
  }

  /**
   * Throttled flicker and bounce; true when a world texture changed. A light map drawn steady
   * (a light moved, the bounce was built) takes its flicker back at once, so a dragged light
   * never blinks between the two.
   */
  animate(now: number): boolean {
    let drew = false;
    if (this.bounceDirty && now - this.lastBounce >= BOUNCE.throttleMs) {
      // Bounce uses steady intensity, so flicker never rebuilds it.
      this.drawSteady();
      this.cascades.build(this.lightMap, this.albedo, this.fieldAll());
      this.bounceDirty = false;
      this.lastBounce = now;
      drew = true;
    }
    if (this.animated() && now - this.lastFlicker >= FLICKER_INTERVAL_MS) {
      this.drawLightMap((light) => this.flicker.sample(light.key, light.animation, now));
      this.lastFlicker = now;
      drew = true;
    }
    return drew;
  }

  /** Animated lights or bounce still to build: keep calling `animate`. */
  busy(): boolean {
    return this.bounceDirty || this.animated();
  }

  /** Builds the bounce now (map load finished, tests). */
  flush(): void {
    this.lastBounce = -Infinity;
    this.animate(performance.now());
  }

  destroy(): void {
    this.tiles.destroy();
    this.cascades.destroy();
    this.lightMap.destroy();
    this.darkness?.destroy();
    this.allField?.destroy();
    this.field.destroy();
  }

  private animated(): boolean {
    return this.lights.some((light) => light.animation !== 'none');
  }

  private createField(): CapsuleField {
    return new CapsuleField(this.renderer, [0, 0, this.bounds.width, this.bounds.height], this.texel, this.wallRadius);
  }

  private rebuildFields(walls: readonly WallSegment[]): void {
    const blocking = splitBlocking(walls);
    this.field.build(blocking.twoWay);
    this.hasOneWay = blocking.oneWay.length > 0;
    if (!this.hasOneWay) return;
    this.allField ??= this.createField();
    this.allField.build(allSegments(blocking));
  }

  private forgetRemoved(lights: readonly EngineLight[]): void {
    const keys = new Set(lights.map((light) => light.key));
    for (const light of this.lights) if (!keys.has(light.key)) this.flicker.forget(light.key);
  }

  private drawSteady(): void {
    this.drawLightMap(() => STEADY);
    this.lastFlicker = -Infinity;
    if (this.lights.some((light) => light.darkness)) this.drawDarkness();
  }

  private drawDarkness(): void {
    this.darkness ??= new DarknessMap(this.renderer, this.bounds, this.texel);
    const tiles = this.tiles.tiles();
    const sources = this.lights.flatMap((light) => {
      const tile = light.darkness ? tiles.get(light.key) : undefined;
      return tile ? [{ tile, dim: light.dim }] : [];
    });
    this.darkness.draw(sources, this.pierce);
  }

  private drawLightMap(sample: (light: EngineLight) => FlickerSample): void {
    const tiles = this.tiles.tiles();
    const drawn: DrawnLight[] = [];
    for (const light of byPriority(this.lights)) {
      const tile = tiles.get(light.key);
      if (!tile) continue;
      if (light.darkness) {
        drawn.push({ tile, bright: 0, dim: light.dim, reach: light.dim, color: light.color, intensity: 0, darkness: true });
        continue;
      }
      const { intensity, radiusScale } = sample(light);
      // Flicker breathes the bright radius only: where a light ends is where the rules end it.
      drawn.push({ tile, bright: light.bright * radiusScale, dim: light.dim, reach: light.dim * LIGHT_REACH, color: light.color, intensity: light.intensity * intensity, cone: light.cone });
    }
    this.lightMap.draw(drawn);
  }
}

function sameLights(a: readonly EngineLight[], b: readonly EngineLight[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.key === y.key && x.x === y.x && x.y === y.y && x.bright === y.bright && x.dim === y.dim && x.flame === y.flame
      && x.intensity === y.intensity && x.animation === y.animation && x.color.every((c, j) => c === y.color[j])
      && !!x.darkness === !!y.darkness && (x.priority ?? 0) === (y.priority ?? 0) && sameCone(x.cone, y.cone);
  });
}

/**
 * The lights in the order the light map draws them: by priority, a darkness after the lights of
 * its own priority, so it swallows them and every light below, and a light above it shines in it.
 * A scene without a darkness keeps its order: lights only add up.
 */
function byPriority(lights: readonly EngineLight[]): readonly EngineLight[] {
  if (!lights.some((light) => light.darkness)) return lights;
  const rank = (light: EngineLight): number => (light.priority ?? 0) * 2 + (light.darkness ? 1 : 0);
  return [...lights].sort((a, b) => rank(a) - rank(b));
}

function sameCone(a: EngineLight['cone'], b: EngineLight['cone']): boolean {
  return a === b || (!!a && !!b && a.facing === b.facing && a.angle === b.angle && (a.apex ?? 0) === (b.apex ?? 0));
}
