import { Buffer, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { DARKNESS } from '../../../lighting/lightingConstants';
import type { Point } from '../../../types/visionTypes';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { Tile } from './TileCache';

/** A darkness source as it swallows light this frame. */
export interface DrawnDarkness {
  tile: Tile;
  dim: number;
}

/** What a sense that sees in magical darkness perceives, and how: 1 as bright light, 0.5 as dim. */
export interface PierceShape {
  origin: Point;
  polygon: Polygon;
  level: number;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  light: Float32Array;
}

/** The uniforms of a darkness source's coverage (`darknessFragment`), which the light map draws too. */
export function darknessUniforms(world: readonly [number, number], texel: number, out: readonly [number, number, number, number]): { uniforms: UniformGroup; rect: Float32Array; light: Float32Array } {
  const rect = new Float32Array(4);
  const light = new Float32Array(2);
  const uniforms = new UniformGroup({
    uRect: { value: rect, type: 'vec4<f32>' },
    uMapWorld: { value: new Float32Array(world), type: 'vec2<f32>' },
    uLight: { value: light, type: 'vec2<f32>' },
    uDim: { value: 0, type: 'f32' },
    uSoft: { value: 1, type: 'f32' },
    uTexel: { value: texel, type: 'f32' },
    uOut: { value: new Float32Array(out), type: 'vec4<f32>' },
  });
  return { uniforms, rect, light };
}

/** Sets a coverage slot to `darkness`: where it is, how far it reaches and how wide its soft edge is. */
export function setDarkness(slot: { uniforms: UniformGroup; rect: Float32Array; light: Float32Array; mesh: Mesh<Geometry, Shader> }, darkness: DrawnDarkness): void {
  slot.rect.set(darkness.tile.rect);
  slot.light[0] = darkness.tile.x;
  slot.light[1] = darkness.tile.y;
  slot.uniforms.uniforms.uDim = darkness.dim;
  slot.uniforms.uniforms.uSoft = darkness.dim * DARKNESS.softEdge;
  slot.mesh.shader!.resources.uTile = darkness.tile.texture.source;
}

/**
 * Where the map is magically dark, in world space like the light map (`rg8unorm`): red is how
 * much of the light the darkness sources swallow there, green what a sense that sees in magical
 * darkness perceives of it (0.5 as dim light, 1 as bright). The composite takes the ambient
 * light, the bounce and the senses that do not see in magical darkness out by red, and lets
 * the senses in green through. It exists only on maps that have had a darkness source.
 */
export class DarknessMap {
  readonly texture: RenderTexture;
  private readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly pierce = new Container();
  private readonly slots: Slot[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rg8unorm');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
    this.scene.addChild(this.pierce);
  }

  draw(sources: readonly DrawnDarkness[], shapes: readonly PierceShape[]): void {
    while (this.slots.length < sources.length) this.slots.push(this.createSlot());
    this.slots.forEach((slot, i) => {
      const source = sources[i];
      slot.mesh.visible = !!source;
      if (source) setDarkness(slot, source);
    });
    this.releasePierce();
    for (const shape of shapes) {
      if (shape.polygon.length >= 3) this.pierce.addChild(this.createPierce(shape));
    }
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
    for (const slot of this.slots) slot.mesh.shader!.resources.uTile = this.placeholder.source;
  }

  private createSlot(): Slot {
    const { uniforms, rect, light } = darknessUniforms(this.world, this.texel, [1, 0, 0, 0]);
    const shader = createShader(ENGINE_SHADERS.darkness, { darknessUniforms: uniforms, uTile: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'max';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, light };
  }

  private createPierce({ origin, polygon, level }: PierceShape): Mesh<Geometry, Shader> {
    const uniforms = new UniformGroup({
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uLevel: { value: level, type: 'f32' },
    });
    const mesh = new Mesh({ geometry: fanGeometry(origin, polygon), shader: createShader(ENGINE_SHADERS.pierce, { pierceUniforms: uniforms }) });
    mesh.blendMode = 'max';
    return mesh;
  }

  private releasePierce(): void {
    for (const mesh of this.pierce.removeChildren() as Mesh<Geometry, Shader>[]) {
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      mesh.destroy();
    }
  }

  destroy(): void {
    this.releasePierce();
    for (const { mesh } of this.slots) mesh.shader?.destroy();
    destroyTree(this.scene);
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
    this.texture.destroy(true);
  }
}

/** A visibility polygon is star-shaped around its origin, so a triangle fan from the origin covers it exactly. */
export function fanGeometry(origin: Point, polygon: Polygon): Geometry {
  const positions = new Float32Array([origin.x, origin.y, ...polygon.flatMap((p) => [p.x, p.y])]);
  const indices: number[] = [];
  for (let i = 1; i <= polygon.length; i++) indices.push(0, i, (i % polygon.length) + 1);
  return new Geometry({
    attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}
