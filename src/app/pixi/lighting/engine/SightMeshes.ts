import { Buffer, BufferImageSource, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Shader } from 'pixi.js';
import { perceivedLevel } from '../../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../../gameSystems/senses/generic';
import type { Point } from '../../../types/visionTypes';
import type { Sight } from '../../../vision/sight';
import { sightWedges, type SightWedge } from '../../../vision/sightWedges';
import type { Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader } from './gpu';
import { MAX_WEDGES } from './sightShader';

type Channel = readonly [number, number, number, number];

const RED: Channel = [1, 0, 0, 0];
const GREEN: Channel = [0, 1, 0, 0];

/** A sight mesh with the GPU objects it owns besides the mesh itself. */
interface SightMesh {
  mesh: Mesh<Geometry, Shader>;
  wedges: BufferImageSource;
}

/**
 * What vision tokens see, drawn into the lighting layer (so each render, including the player
 * window's own camera, draws it with its camera): red = in sight, green = darkvision.
 * Tokens combine with `max`. A visibility polygon is star-shaped around its origin, so a
 * triangle fan from the origin covers it exactly.
 */
export class SightMeshes {
  readonly view = new Container({ label: 'sight' });
  private meshes: SightMesh[] = [];

  draw(sight: Sight, radius: number): void {
    this.clear();
    if (sight.all) return;
    // Sight first, then what sees in darkness, as the meshes were ordered before senses.
    const shown = sight.regions.filter((region) => region.sense.reveals === 'all' && region.polygon);
    for (const { sense, polygon, origin, apex } of shown) if (sense === NORMAL_SIGHT) this.add(polygon!, origin, apex, radius, RED);
    for (const { sense, polygon, origin, apex } of shown) {
      if (sense !== NORMAL_SIGHT && perceivedLevel(sense, 'dark') !== null) this.add(polygon!, origin, apex, radius, GREEN);
    }
  }

  private add(polygon: Polygon, origin: Point, apex: number, radius: number, channel: Channel): void {
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
    this.meshes.push({ mesh, wedges: wedgeSource });
  }

  private clear(): void {
    this.view.removeChildren();
    for (const { mesh, wedges } of this.meshes) {
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      wedges.destroy();
      mesh.destroy();
    }
    this.meshes = [];
  }

  destroy(): void {
    this.clear();
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
