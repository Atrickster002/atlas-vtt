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

  /**
   * Each footprint as walls leave it (`SeenSpot.polygon`): never the whole disc, which would show
   * the far side of a wall the token stands at. Its edges stay hard: a wedge only ever softens
   * sight, and a footprint is too small for one.
   */
  drawSpots(spots: readonly SeenSpot[]): void {
    this.clear(this.spots);
    this.spots = [];
    for (const spot of spots) this.add(this.spots, spot.polygon, spot, 0, 0, SPOT_CHANNELS, false);
  }

  private add(list: SightMesh[], polygon: Polygon, origin: Point, apex: number, radius: number, channel: SightChannels, soft = true): void {
    if (polygon.length < 3) return;
    const wedges = soft ? sightWedges(origin, polygon, radius, apex).slice(0, MAX_WEDGES) : [];
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
