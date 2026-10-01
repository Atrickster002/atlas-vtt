import { describe, expect, it } from 'vitest';
import { ambientLevel, lightLevelAt } from '../lightLevels';
import { perceivedLevel } from '../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../gameSystems/senses';
import { lightReach, type AmbientLight, type LightReach } from '../sight';
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
  it('is dark below the lit threshold, dim from there, bright from the bright threshold', () => {
    expect(ambientLevel({ ambient: 0 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.24 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.25 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.74 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.75 })).toBe('bright');
    expect(ambientLevel({ ambient: 1 })).toBe('bright');
  });

  it('reads the time-of-day presets as the rules do: day bright, dusk dim, night and pitch black dark', () => {
    expect([1, 0.5, 0.15, 0].map((ambient) => ambientLevel({ ambient }))).toEqual(['bright', 'dim', 'dark', 'dark']);
  });

  it('follows the scene\'s own thresholds', () => {
    expect(ambientLevel({ ambient: 0.4, litThreshold: 0.5 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.5, litThreshold: 0.5 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.5, brightThreshold: 0.5 })).toBe('bright');
    expect(ambientLevel({ ambient: 0.8, brightThreshold: 0.9 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.9, litThreshold: 0.9 })).toBe('bright');
    expect(ambientLevel({ ambient: 0, litThreshold: 0 })).toBe('dim');
    expect(ambientLevel({ ambient: 0, litThreshold: 0, brightThreshold: 0 })).toBe('bright');
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
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.5 }, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 130 }, { ambient: 0.5 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 180 }, { ambient: 0.1 }, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.8 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 300, y: 100 }, { ambient: 0.8 }, [torch])).toBe('bright');
  });

  it('never reports magical darkness, which only darkness sources will make', () => {
    for (const ambient of [0, 0.5, 1]) {
      for (const y of [100, 180, 500]) expect(lightLevelAt({ x: 100, y }, { ambient }, [torch])).not.toBe('magical-dark');
    }
  });
});

/** Whether a point counted as lit before light levels existed, as `sight.ts` had it. */
function isLitBefore(point: { x: number; y: number }, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  const threshold = ambient.litThreshold === undefined ? 0.25 : Math.min(1, Math.max(0, ambient.litThreshold));
  if (ambient.ambient >= threshold) return true;
  return lights.some((light) => Math.hypot(point.x - light.origin.x, point.y - light.origin.y) <= light.dim && pointInPolygon(point, light.polygon));
}

describe('what normal sight sees by the light level', () => {
  const points = [{ x: 100, y: 100 }, { x: 100, y: 150 }, { x: 100, y: 151 }, { x: 100, y: 195 }, { x: 100, y: 201 }, { x: 250, y: 100 }, { x: 190, y: 100 }];
  const ambients = [0, 0.05, 0.1, 0.12, 0.125, 0.13, 0.2, 0.24, 0.25, 0.26, 0.5, 0.74, 0.75, 1];
  const thresholds = [undefined, 0, 0.1, 0.5, 1, 7];
  const lit = (point: { x: number; y: number }, scene: AmbientLight, lights: readonly LightReach[]): boolean =>
    perceivedLevel(NORMAL_SIGHT, lightLevelAt(point, scene, lights)) !== null;

  it('is what counted as lit before light levels existed, for every scene', () => {
    for (const lights of [[], [torch], [torch, lightReach({ x: 250, y: 100 }, 30, [wall])]]) {
      for (const litThreshold of thresholds) {
        for (const brightThreshold of [undefined, 0.3, 1]) {
          for (const ambient of ambients) {
            const scene: AmbientLight = { ambient, ...(litThreshold !== undefined && { litThreshold }), ...(brightThreshold !== undefined && { brightThreshold }) };
            for (const point of points) expect(lit(point, scene, lights)).toBe(isLitBefore(point, scene, lights));
          }
        }
      }
    }
  });

  it('is lit from the lit threshold itself', () => {
    expect(lit({ x: 100, y: 400 }, { ambient: 0.1, litThreshold: 0.1 }, [])).toBe(true);
    expect(lit({ x: 100, y: 400 }, { ambient: 0.1 }, [])).toBe(false);
  });
});
