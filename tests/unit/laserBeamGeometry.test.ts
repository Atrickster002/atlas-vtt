import { describe, expect, it } from 'vitest';
import {
  createLaserBeamBuffers,
  smoothBeam,
  writeLaserBeam,
  type BeamPoint,
  type LaserBeamBuffers,
} from '../../src/app/pixi/laser/laserBeamGeometry';

interface Capsule {
  corners: { x: number; y: number }[];
  segment: number[];
  shape: number[];
}

/** Capsules written this frame, read back from the buffers; unused slots are empty triangles. */
function capsules(buffers: LaserBeamBuffers): Capsule[] {
  const result: Capsule[] = [];
  for (let quad = 0; quad * 6 < buffers.indices.length; quad++) {
    const indices = buffers.indices.subarray(quad * 6, quad * 6 + 6);
    if (indices.every((index) => index === 0)) break;
    const first = indices[0]!;
    result.push({
      corners: [0, 1, 2, 3].map((corner) => ({ x: buffers.positions[(first + corner) * 2]!, y: buffers.positions[(first + corner) * 2 + 1]! })),
      segment: Array.from(buffers.segments.subarray(first * 4, first * 4 + 4)),
      shape: Array.from(buffers.shapes.subarray(first * 4, first * 4 + 4)),
    });
  }
  return result;
}

/** Distance from `point` to the segment from (ax, ay) to (bx, by). */
function distanceToSegment(point: { x: number; y: number }, [ax, ay, bx, by]: number[]): number {
  const [dx, dy] = [bx! - ax!, by! - ay!];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - ax!) * dx + (point.y - ay!) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (ax! + dx * t), point.y - (ay! + dy * t));
}

const line = (lives: number[]): BeamPoint[] => lives.map((life, i) => ({ x: i * 10, y: 0, life }));

describe('laser beam smoothing', () => {
  it('passes through every pointer sample and interpolates life between them', () => {
    const points: BeamPoint[] = [{ x: 0, y: 0, life: 0.2 }, { x: 30, y: 10, life: 0.5 }, { x: 60, y: 0, life: 1 }];
    const smoothed = smoothBeam(points, 3);
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed.at(-1)).toEqual(points[2]);
    expect(smoothed).toContainEqual(points[1]);
    expect(smoothed.every((point, i) => i === 0 || point.life >= smoothed[i - 1]!.life)).toBe(true);
  });

  it('adds points on long steps, up to eight per step', () => {
    const points: BeamPoint[] = [{ x: 0, y: 0, life: 1 }, { x: 12, y: 0, life: 1 }, { x: 1000, y: 0, life: 1 }];
    expect(smoothBeam(points, 3)).toHaveLength(4 + 8 + 1);
  });
});

describe('laser beam geometry', () => {
  it('draws a capsule per segment that narrows as its points age', () => {
    const buffers = createLaserBeamBuffers();
    writeLaserBeam(buffers, line([0.25, 1, 1]), null, 10);
    const written = capsules(buffers);
    expect(written).toHaveLength(2);
    expect(written[0]!.segment).toEqual([0, 0, 10, 0]);
    expect(written[0]!.shape).toEqual([0.25, 1, 5, 10]);
  });

  it('builds each capsule from its own segment, so jitter in a neighbour cannot bend it', () => {
    const steady = createLaserBeamBuffers();
    const jittered = createLaserBeamBuffers();
    writeLaserBeam(steady, [{ x: 0, y: 0, life: 1 }, { x: 10, y: 0, life: 1 }, { x: 20, y: 0, life: 1 }], null, 10);
    writeLaserBeam(jittered, [{ x: 0, y: 0, life: 1 }, { x: 10, y: 0, life: 1 }, { x: 9, y: 0.5, life: 1 }], null, 10);
    expect(capsules(jittered)[0]).toEqual(capsules(steady)[0]);
  });

  it('covers every point of a capsule, however sharply the path turns', () => {
    const buffers = createLaserBeamBuffers();
    writeLaserBeam(buffers, [{ x: 0, y: 0, life: 1 }, { x: 40, y: 3, life: 1 }, { x: 1, y: 6, life: 1 }], null, 10);
    for (const capsule of capsules(buffers)) {
      const xs = capsule.corners.map((corner) => corner.x);
      const ys = capsule.corners.map((corner) => corner.y);
      // Every corner lies a full radius (or more) away from the segment.
      expect(capsule.corners.every((corner) => distanceToSegment(corner, capsule.segment) >= 10 - 1e-6)).toBe(true);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(20);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(20);
    }
  });

  it('draws the hovering pointer as a round dot a little wider than the beam', () => {
    const buffers = createLaserBeamBuffers();
    const bounds = writeLaserBeam(buffers, [], { x: 5, y: 5, life: 1 }, 12);
    const [dot] = capsules(buffers);
    expect(dot!.segment).toEqual([5, 5, 5, 5]);
    expect(dot!.shape).toEqual([1, 1, 15, 15]);
    expect(bounds).toEqual({ minX: -10, minY: -10, maxX: 20, maxY: 20 });
  });

  it('reports the covered area and empties what a longer previous frame left behind', () => {
    const buffers = createLaserBeamBuffers();
    writeLaserBeam(buffers, line([0.2, 0.4, 0.6, 0.8, 1]), null, 10);
    expect(capsules(buffers)).toHaveLength(4);
    const bounds = writeLaserBeam(buffers, line([1, 1]), null, 10);
    expect(capsules(buffers)).toHaveLength(1);
    expect(bounds).toEqual({ minX: -10, minY: -10, maxX: 20, maxY: 10 });
    expect(writeLaserBeam(buffers, [], null, 10)).toBeNull();
    expect(capsules(buffers)).toHaveLength(0);
  });
});
