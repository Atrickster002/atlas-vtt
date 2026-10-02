import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { MAX_ZONE_CORNERS } from '../../../lighting/lightZones';
import { DEFAULT_AMBIENT_COLOR, brightThresholdOf } from '../../../lighting/sceneLightingOptions';
import { linearColor } from '../../../lighting/srgb';
import { ambientLevel } from '../../../vision/lightLevels';
import type { MapBounds } from '../../../vision/visibility';
import type { CapsuleField } from './CapsuleField';
import { ENGINE_SHADERS } from './engineShaders';
import { createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { EngineZone } from './types';

type Rgb = readonly [number, number, number];

/** A zone as it is drawn: its outline, how wide its soft edge is, and its ambient light in linear light. */
interface DrawnZone {
  zone: EngineZone;
  light: Rgb;
  /** The same light where dim light is perceived as bright (`ambientLift`). */
  lifted: Rgb;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  points: Float32Array;
  light: Float32Array;
}

/** What of the scene decides a zone's light: its colour where the zone has none, and the levels dim light lies between. */
export interface ZoneLook {
  ambientColor?: string | undefined;
  litThreshold?: number | undefined;
  brightThreshold?: number | undefined;
}

/**
 * The ambient light of the scene's zones over the map, in world space like the light map
 * (`rgba16float`, premultiplied): the composite takes `rgb + scene ambient · (1 − alpha)` as the
 * ambient light of a pixel. Inside a zone's polygon alpha is 1, so the pixel has the zone's
 * light exactly, as the rule counts it; the soft edge lies outside (`zoneFragment`). `lifted` is
 * the same with every zone's light where dim light is perceived as bright. It exists only while
 * the scene has a zone.
 */
export class ZoneMap {
  readonly texture: RenderTexture;
  readonly lifted: RenderTexture;
  private readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);

  constructor(private readonly renderer: Renderer, bounds: MapBounds, texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.lifted = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  /** Draws `zones` in their order, later ones over earlier ones, through the walls of `field`. */
  draw(zones: readonly EngineZone[], look: ZoneLook, field: CapsuleField): void {
    const drawn = zones.map((zone) => drawnZone(zone, look));
    while (this.slots.length < drawn.length) this.slots.push(this.createSlot(field));
    this.slots.forEach((slot, i) => {
      const next = drawn[i];
      slot.mesh.visible = !!next;
      if (!next) return;
      const { polygon, soft } = next.zone;
      const xs = polygon.map((p) => p.x);
      const ys = polygon.map((p) => p.y);
      const x = Math.min(...xs) - soft;
      const y = Math.min(...ys) - soft;
      slot.rect.set([x, y, Math.max(...xs) + soft - x, Math.max(...ys) + soft - y]);
      slot.points.set(polygon.flatMap((p) => [p.x, p.y]));
      slot.uniforms.uniforms.uCount = polygon.length;
      slot.uniforms.uniforms.uSoft = soft;
      Object.assign(slot.mesh.shader!.resources, field.resources());
    });
    for (const [target, pick] of [[this.texture, 'light'], [this.lifted, 'lifted']] as const) {
      this.slots.forEach((slot, i) => {
        if (drawn[i]) slot.light.set(drawn[i][pick]);
        slot.uniforms.update();
      });
      renderInto(this.renderer, this.scene, target, [0, 0, 0, 0]);
    }
  }

  private createSlot(field: CapsuleField): Slot {
    const rect = new Float32Array(4);
    const points = new Float32Array(MAX_ZONE_CORNERS * 2);
    const light = new Float32Array(3);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uPoints: { value: points, type: 'vec2<f32>', size: MAX_ZONE_CORNERS },
      uCount: { value: 0, type: 'i32' },
      uSoft: { value: 1, type: 'f32' },
      uZoneLight: { value: light, type: 'vec3<f32>' },
    });
    const mesh = new Mesh({ geometry: this.geometry, shader: createShader(ENGINE_SHADERS.zone, { zoneUniforms: uniforms, ...field.resources() }) });
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, points, light };
  }

  destroy(): void {
    for (const { mesh } of this.slots) mesh.shader?.destroy();
    this.scene.destroy({ children: true });
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.texture.destroy(true);
    this.lifted.destroy(true);
  }
}

/** A zone's ambient light as the composite adds it: its colour (the scene's without one) in linear light, at its level. */
function drawnZone(zone: EngineZone, look: ZoneLook): DrawnZone {
  const light = linearColor(zone.ambientColor ?? look.ambientColor ?? DEFAULT_AMBIENT_COLOR, zone.ambient);
  const level = { ambient: zone.ambient, ...(look.litThreshold !== undefined && { litThreshold: look.litThreshold }), ...(look.brightThreshold !== undefined && { brightThreshold: look.brightThreshold }) };
  // Dim light raised to bright, as `ambientLift` raises the scene's.
  const lift = ambientLevel(level) === 'dim' && zone.ambient > 0 ? brightThresholdOf(level) / zone.ambient : 1;
  return { zone, light, lifted: [light[0] * lift, light[1] * lift, light[2] * lift] };
}
