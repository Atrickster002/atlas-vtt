import { Buffer, BufferImageSource, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Shader } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import { sightWedges, type SightWedge } from '../../../vision/sightWedges';
import type { Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader } from './gpu';
import { SPOT_CHANNELS, sightChannels, type SightChannels } from './senseDrawing';
import { MAX_WEDGES } from './sightShader';

/** A sight mesh with the GPU objects it owns besides the mesh itself. */
interface SightMesh {
  mesh: Mesh<Geometry, Shader>;
  wedges: BufferImageSource;
}

/**
 * What vision tokens see, drawn into the lighting layer (so each render, including the player
 * window's own camera, draws it with its camera): one mesh per token and sense, in the channels
 * `sightChannels` gives the sense (red = seen by light, green and blue = perceived without
 * light, alpha = dim light as bright). Meshes combine with `max`. A visibility polygon is
 * star-shaped around its origin, so a triangle fan from the origin covers it exactly.
 */
export class SightMeshes {
  readonly view = new Container({ label: 'sight' });
  private meshes: SightMesh[] = [];
  /** The footprints of tokens shown where no sense shows the map: drawn apart, since they follow a dragged token. */
  private spots: SightMesh[] = [];

  draw(sight: Sight, radius: number): void {
    this.clear(this.meshes);
    this.meshes = [];
    if (sight.all) return;
    for (const region of sight.regions) {
      const channels = sightChannels(region);
      if (channels && region.polygon) this.add(this.meshes, region.polygon, region.origin, region.apex, radius, channels);
    }
  }

  /** A disc has no shadow edges, so no wedge softens it. */
  drawSpots(spots: readonly SeenSpot[], radius: number): void {
    this.clear(this.spots);
    this.spots = [];
    for (const spot of spots) this.add(this.spots, disc(spot), spot, 0, radius, SPOT_CHANNELS);
  }

  private add(list: SightMesh[], polygon: Polygon, origin: Point, apex: number, radius: number, channel: SightChannels): void {
    if (polygon.length < 3) return;
    const wedges = sightWedges(origin, polygon, radius, apex).slice(0, MAX_WEDGES);
    const wedgeSource = wedgeTexture(wedges);
    const uniforms = new UniformGroup({
      uWedgeCount: { value: wedges.length, type: 'i32' },
      uChannel: { value: new Float32Array(channel), type: 'vec4<f32>' },
    });
    const shader = createShader(ENGINE_SHADERS.sight, { sightUniforms: uniforms, uWedges: wedgeSource });
    const mesh = new Mesh({ geometry: fanGeometry(origin, polygon), shader });
    mesh.blendMode = 'max';
    this.view.addChild(mesh);
    list.push({ mesh, wedges: wedgeSource });
  }

  private clear(list: readonly SightMesh[]): void {
    for (const { mesh, wedges } of list) {
      this.view.removeChild(mesh);
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      wedges.destroy();
      mesh.destroy();
    }
  }

  destroy(): void {
    this.clear(this.meshes);
    this.clear(this.spots);
    destroyTree(this.view);
  }
}

const DISC_STEPS = 32;

function disc({ x, y, radius }: SeenSpot): Polygon {
  return Array.from({ length: DISC_STEPS }, (_, i) => {
    const angle = (i / DISC_STEPS) * 2 * Math.PI;
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
  });
}

/** Two rows of `rgba32float` texels, one column per wedge: corner and edge, then side and angle. */
function wedgeTexture(wedges: readonly SightWedge[]): BufferImageSource {
  const count = Math.max(1, wedges.length);
  const data = new Float32Array(count * 2 * 4);
  wedges.forEach((w, i) => {
    data.set([w.a.x, w.a.y, w.e.x, w.e.y], i * 4);
    data.set([w.side, w.phi, 0, 0], (count + i) * 4);
  });
  // Premultiplying on upload is invalid for float data and leaves the texture empty.
  return new BufferImageSource({
    resource: data,
    width: count,
    height: 2,
    format: 'rgba32float',
    scaleMode: 'nearest',
    alphaMode: 'no-premultiply-alpha',
  });
}

function fanGeometry(origin: Point, polygon: Polygon): Geometry {
  const positions = new Float32Array([origin.x, origin.y, ...polygon.flatMap((p) => [p.x, p.y])]);
  const indices: number[] = [];
  for (let i = 1; i <= polygon.length; i++) indices.push(0, i, (i % polygon.length) + 1);
  return new Geometry({
    attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}
