import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { HALO, LIGHT_LEVELS } from '../../../lighting/lightingConstants';
import type { MapBounds } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
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
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  light: Float32Array;
  color: Float32Array;
}

/**
 * Every light's direct light over the map in world space (`rgba16float`, HDR): independent of
 * any camera, so the GM view and the player window read the same texture.
 */
export class LightMap {
  readonly texture: RenderTexture;
  readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  /** Bound to idle slots, so no slot keeps a tile texture its owner may destroy. */
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  draw(lights: readonly DrawnLight[]): void {
    while (this.slots.length < lights.length) this.slots.push(this.createSlot());
    this.slots.forEach((slot, i) => {
      const light = lights[i];
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
      slot.mesh.shader!.resources.uTile = light.tile.texture.source;
    });
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
    for (const slot of this.slots) slot.mesh.shader!.resources.uTile = this.placeholder.source;
  }

  private createSlot(): Slot {
    const rect = new Float32Array(4);
    const light = new Float32Array(2);
    const color = new Float32Array(3);
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
    });
    const shader = createShader(ENGINE_SHADERS.lightMap, { lightUniforms: uniforms, uTile: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, light, color };
  }

  destroy(): void {
    for (const { mesh } of this.slots) mesh.shader?.destroy();
    destroyTree(this.scene);
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
    this.texture.destroy(true);
  }
}
