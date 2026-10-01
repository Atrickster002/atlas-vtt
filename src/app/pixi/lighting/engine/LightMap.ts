import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { CONE_APEX_FADE, CONE_SPILL, HALO, LIGHT_LEVELS } from '../../../lighting/lightingConstants';
import type { VisionCone } from '../../../vision/visionCone';
import type { MapBounds } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { darknessUniforms, setDarkness } from './DarknessMap';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { Tile } from './TileCache';

/** One light's contribution this frame (bright radius and intensity already flickered). */
export interface DrawnLight {
  tile: Tile;
  bright: number;
  dim: number;
  reach: number;
  color: readonly [number, number, number];
  intensity: number;
  /** A darkness source: it takes the light drawn before it out of its area instead of adding any. */
  darkness?: boolean;
  /** A light that shines one way; unset shines all around. */
  cone?: VisionCone | undefined;
}

/** A darkness source's slot: its coverage, drawn with `erase`. */
interface DarknessSlot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  light: Float32Array;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  light: Float32Array;
  color: Float32Array;
  cone: Float32Array;
}

/** No cone: half an angle of a full turn, which the shader reads as all around. */
const ALL_AROUND = [1, 0, 2 * Math.PI, 0] as const;

/**
 * Every light's direct light over the map in world space (`rgba16float`, HDR): independent of
 * any camera, so the GM view and the player window read the same texture. Lights add up; a
 * darkness source erases what was drawn before it within its area, so the order of `draw`'s
 * list is the order of priority: a light listed after a darkness shines in it.
 */
export class LightMap {
  readonly texture: RenderTexture;
  readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly darkSlots: DarknessSlot[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  /** The meshes were put in an order of priority: the next draw without a darkness puts them back. */
  private ordered = false;
  /** Bound to idle slots, so no slot keeps a tile texture its owner may destroy. */
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  draw(lights: readonly DrawnLight[]): void {
    const shining = lights.filter((light) => !light.darkness);
    const dark = lights.filter((light) => light.darkness);
    while (this.slots.length < shining.length) this.slots.push(this.createSlot());
    while (this.darkSlots.length < dark.length) this.darkSlots.push(this.createDarkSlot());
    this.slots.forEach((slot, i) => {
      const light = shining[i];
      slot.mesh.visible = !!light;
      if (!light) return;
      const u = slot.uniforms.uniforms;
      slot.rect.set(light.tile.rect);
      slot.light[0] = light.tile.x;
      slot.light[1] = light.tile.y;
      u.uBright = light.bright;
      u.uDim = light.dim;
      u.uReach = light.reach;
      u.uIntensity = light.intensity;
      slot.color.set(light.color);
      const { cone } = light;
      slot.cone.set(cone ? [Math.cos(cone.facing), Math.sin(cone.facing), cone.angle / 2, cone.apex ?? 0] : ALL_AROUND);
      slot.mesh.shader!.resources.uTile = light.tile.texture.source;
    });
    this.darkSlots.forEach((slot, i) => {
      const darkness = dark[i];
      slot.mesh.visible = !!darkness;
      if (darkness) setDarkness(slot, darkness);
    });
    // Without a darkness the meshes stay in the order they were made: lights only add up.
    if (dark.length > 0 || this.ordered) this.order(lights, shining, dark);
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
    for (const slot of [...this.slots, ...this.darkSlots]) slot.mesh.shader!.resources.uTile = this.placeholder.source;
  }

  /** Puts the meshes in the order of `lights`, so each darkness erases exactly the lights listed before it. */
  private order(lights: readonly DrawnLight[], shining: readonly DrawnLight[], dark: readonly DrawnLight[]): void {
    lights.forEach((light, z) => {
      const slot = light.darkness ? this.darkSlots[dark.indexOf(light)] : this.slots[shining.indexOf(light)];
      slot!.mesh.zIndex = z;
    });
    this.ordered = dark.length > 0;
    this.scene.sortChildren();
  }

  private createDarkSlot(): DarknessSlot {
    const { uniforms, rect, light } = darknessUniforms(this.world, this.texel, [0, 0, 0, 1]);
    const shader = createShader(ENGINE_SHADERS.darkness, { darknessUniforms: uniforms, uTile: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'erase';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, light };
  }

  private createSlot(): Slot {
    const rect = new Float32Array(4);
    const light = new Float32Array(2);
    const color = new Float32Array(3);
    const cone = new Float32Array(ALL_AROUND);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uLight: { value: light, type: 'vec2<f32>' },
      uBright: { value: 0, type: 'f32' },
      uDim: { value: 0, type: 'f32' },
      uReach: { value: 1, type: 'f32' },
      uIntensity: { value: 1, type: 'f32' },
      uLightColor: { value: color, type: 'vec3<f32>' },
      uBrightLevel: { value: LIGHT_LEVELS.bright, type: 'f32' },
      uDimLevel: { value: LIGHT_LEVELS.dim, type: 'f32' },
      uHaloGain: { value: HALO.gain, type: 'f32' },
      uHaloSize: { value: HALO.size, type: 'f32' },
      uTexel: { value: this.texel, type: 'f32' },
      uCone: { value: cone, type: 'vec4<f32>' },
      uSpill: { value: new Float32Array([CONE_SPILL, CONE_APEX_FADE]), type: 'vec2<f32>' },
    });
    const shader = createShader(ENGINE_SHADERS.lightMap, { lightUniforms: uniforms, uTile: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, light, color, cone };
  }

  destroy(): void {
    for (const { mesh } of [...this.slots, ...this.darkSlots]) mesh.shader?.destroy();
    destroyTree(this.scene);
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
    this.texture.destroy(true);
  }
}
