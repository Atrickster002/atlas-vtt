import { describe, expect, it } from 'vitest';
import { ambientLevel, isLit, lightLevelAt } from '../lightLevels';
import { computeSight, isSeen, lightReach, type AmbientLight, type LightReach } from '../sight';
import { pointInPolygon } from '../visibility';
import type { WallSegment } from '../../types/wallTypes';

const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };
/** A torch at (100, 100): bright to 50 px, dim to 100 px, with a wall 100 px to its right. */
const torch = lightReach({ x: 100, y: 100 }, 100, [wall], 50);
const dark: AmbientLight = { ambient: 0 };

describe('lightReach', () => {
  it('carries the bright radius beside the dim one', () => {
    expect(torch).toMatchObject({ origin: { x: 100, y: 100 }, bright: 50, dim: 100 });
  });

  it('has no bright part when none is given', () => {
    expect(lightReach({ x: 0, y: 0 }, 100, []).bright).toBe(0);
  });
});

describe('ambientLevel', () => {
  it('is bright from the lit threshold, dim from half of it, dark below', () => {
    expect(ambientLevel({ ambient: 1 })).toBe('bright');
    expect(ambientLevel({ ambient: 0.25 })).toBe('bright');
    expect(ambientLevel({ ambient: 0.24 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.125 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.12 })).toBe('dark');
    expect(ambientLevel({ ambient: 0 })).toBe('dark');
  });

  it('follows the scene\'s own thresholds', () => {
    expect(ambientLevel({ ambient: 0.4, litThreshold: 0.8 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.39, litThreshold: 0.8 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.1, litThreshold: 0.8, dimThreshold: 0.05 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.3, litThreshold: 0.8, dimThreshold: 0.5 })).toBe('dark');
    expect(ambientLevel({ ambient: 0, litThreshold: 0 })).toBe('bright');
  });
});

describe('lightLevelAt', () => {
  it('is bright within a light\'s bright radius, dim out to its dim radius, dark beyond', () => {
    expect(lightLevelAt({ x: 100, y: 130 }, dark, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 150 }, dark, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 151 }, dark, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 195 }, dark, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 201 }, dark, [torch])).toBe('dark');
  });

  it('is dark behind a wall, however close the light', () => {
    const lamp = lightReach({ x: 190, y: 100 }, 100, [wall], 50);
    expect(lightLevelAt({ x: 180, y: 100 }, dark, [lamp])).toBe('bright');
    expect(lightLevelAt({ x: 210, y: 100 }, dark, [lamp])).toBe('dark');
    expect(lightLevelAt({ x: 260, y: 100 }, dark, [lamp])).toBe('dark');
  });

  it('is dark without lights in a dark scene', () => {
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [])).toBe('dark');
  });

  it('takes the brightest of the ambient light and every light', () => {
    const candle = lightReach({ x: 100, y: 180 }, 40, [], 10);
    expect(lightLevelAt({ x: 100, y: 185 }, dark, [torch, candle])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 185 }, dark, [candle, torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 165 }, dark, [candle, torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.2 }, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 130 }, { ambient: 0.2 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.5 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 300, y: 100 }, { ambient: 0.5 }, [torch])).toBe('bright');
  });

  it('never reports magical darkness, which only darkness sources will make', () => {
    for (const ambient of [0, 0.2, 1]) {
      for (const y of [100, 180, 500]) expect(lightLevelAt({ x: 100, y }, { ambient }, [torch])).not.toBe('magical-dark');
    }
  });
});

/** `isLit` as `sight.ts` had it before light levels existed. */
function isLitBefore(point: { x: number; y: number }, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  const threshold = ambient.litThreshold === undefined ? 0.25 : Math.min(1, Math.max(0, ambient.litThreshold));
  if (ambient.ambient >= threshold) return true;
  return lights.some((light) => Math.hypot(point.x - light.origin.x, point.y - light.origin.y) <= light.dim && pointInPolygon(point, light.polygon));
}

describe('isLit', () => {
  const points = [{ x: 100, y: 100 }, { x: 100, y: 150 }, { x: 100, y: 151 }, { x: 100, y: 200 }, { x: 100, y: 201 }, { x: 250, y: 100 }, { x: 190, y: 100 }];
  const ambients = [0, 0.05, 0.12, 0.125, 0.13, 0.2, 0.24, 0.25, 0.26, 0.5, 1];
  const thresholds = [undefined, 0, 0.1, 0.5, 1, 7];

  it('gives the same answer as before for every scene without a dim threshold', () => {
    for (const lights of [[], [torch], [torch, lightReach({ x: 250, y: 100 }, 30, [wall])]]) {
      for (const litThreshold of thresholds) {
        for (const ambient of ambients) {
          const scene: AmbientLight = { ambient, ...(litThreshold !== undefined && { litThreshold }) };
          for (const point of points) expect(isLit(point, scene, lights)).toBe(isLitBefore(point, scene, lights));
        }
      }
    }
  });

  it('does not count dim ambient light as lit: between the two thresholds a point is lit only by a light', () => {
    const dusk: AmbientLight = { ambient: 0.2 };
    expect(lightLevelAt({ x: 100, y: 400 }, dusk, [])).toBe('dim');
    expect(isLit({ x: 100, y: 400 }, dusk, [])).toBe(false);
    expect(isLit({ x: 100, y: 180 }, dusk, [torch])).toBe(true);
    expect(isLit({ x: 100, y: 400 }, { ambient: 0.2, dimThreshold: 0.05 }, [])).toBe(false);
  });

  it('counts a light\'s dim and bright parts as lit', () => {
    expect(isLit({ x: 100, y: 130 }, dark, [torch])).toBe(true);
    expect(isLit({ x: 100, y: 190 }, dark, [torch])).toBe(true);
    expect(isLit({ x: 100, y: 210 }, dark, [torch])).toBe(false);
  });

  it('leaves what tokens see unchanged in dim ambient light', () => {
    const sight = computeSight([{ tokenId: 't', origin: { x: 100, y: 100 }, range: 1000, darkvision: 0 }], []);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.2 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.25 }, [])).toBe(true);
  });
});
