import { Buffer, BufferUsage, Geometry } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { WallSegment } from '../../../types/wallTypes';
import { sweepVisibility, wallsInReach, type Swept } from '../../../vision/visibility';
import type { EngineLight } from './types';

interface Entry {
  x: number;
  y: number;
  reach: number;
  walls: readonly WallSegment[];
  mask: Geometry | null;
}

/**
 * Where each light stops at limited walls, as the rule counts it. A sphere trace cannot count
 * the walls it crosses, so a light's tile is traced through solid walls only and the light is
 * drawn into the light map through this mask: the visibility polygon of its place over the
 * limited walls alone (`sweepVisibility`, the sweep the rule's reach is made with), as a fan.
 * Solid walls and limited ones stop a ray independently, at whichever comes first, so the tile
 * times the mask is the rule's reach, with the soft shadows of solid walls as they were.
 *
 * Each triangle of the fan knows its outer edge and whether that edge lies on a limited wall
 * that stopped the light (`aMargin`): there the shader lights nothing within a capsule's width
 * of the edge, as a tile lights nothing inside a solid wall's capsule, so no bilinear read
 * carries light across the wall's centre line, and the composite gives the wall's near face the
 * light of the floor in front of it as it does for every wall. A light that fewer than two
 * limited walls can stop has no mask and is drawn as ever.
 */
export class LimitedMasks {
  private readonly entries = new Map<string, Entry>();

  /** The mask of `light` out to `reach` world pixels, or null if no limited wall stops it; kept while the light's place, its reach and the walls stay. */
  get(light: EngineLight, reach: number, walls: readonly WallSegment[]): Geometry | null {
    let entry = this.entries.get(light.key);
    if (!entry || entry.walls !== walls || entry.x !== light.x || entry.y !== light.y || entry.reach !== reach) {
      entry?.mask?.destroy(true);
      entry = { x: light.x, y: light.y, reach, walls, mask: maskOf({ x: light.x, y: light.y }, reach, walls) };
      this.entries.set(light.key, entry);
    }
    return entry.mask;
  }

  forget(key: string): void {
    this.entries.get(key)?.mask?.destroy(true);
    this.entries.delete(key);
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.mask?.destroy(true);
    this.entries.clear();
  }
}

function maskOf(origin: Point, reach: number, walls: readonly WallSegment[]): Geometry | null {
  // The polygon's rim is straight between its rays: a little wider than the reach, so it holds all of it.
  const radius = reach * 1.01 + 2;
  const limited = wallsInReach(walls, origin, radius, 'light').filter((wall) => wall.limited);
  if (limited.length < 2) return null;
  const swept = sweepVisibility(origin, radius, limited, 'light');
  return swept.stops.some((stop) => stop !== null) ? fan(origin, swept) : null;
}

/** The polygon as triangles from its origin, each corner carrying its triangle's outer edge and whether that lies on a wall that stopped the light. */
function fan(origin: Point, { polygon, stops }: Swept): Geometry {
  const count = polygon.length;
  const positions = new Float32Array(count * 6);
  const edges = new Float32Array(count * 12);
  const margins = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const a = polygon[i]!, b = polygon[j]!;
    positions.set([origin.x, origin.y, a.x, a.y, b.x, b.y], i * 6);
    const onWall = !!stops[i] && !!stops[j] && stops[i]!.some((wall) => stops[j]!.includes(wall));
    for (let corner = 0; corner < 3; corner++) {
      edges.set([a.x, a.y, b.x, b.y], i * 12 + corner * 4);
      margins[i * 3 + corner] = onWall ? 1 : 0;
    }
  }
  const buffer = (data: Float32Array): Buffer => new Buffer({ data, usage: BufferUsage.VERTEX });
  return new Geometry({
    attributes: {
      aPosition: { buffer: buffer(positions), format: 'float32x2' },
      aEdge: { buffer: buffer(edges), format: 'float32x4' },
      aMargin: { buffer: buffer(margins), format: 'float32' },
    },
  });
}
