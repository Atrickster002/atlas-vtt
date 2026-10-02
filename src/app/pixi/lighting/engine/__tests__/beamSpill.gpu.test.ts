import { afterEach, describe, expect, it } from 'vitest';
import { LIGHT_LEVELS } from '../../../../lighting/lightingConstants';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { lightReach } from '../../../../vision/sight';
import { engineLight } from '../../lightSources';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';

const BOUNDS = { width: 4096, height: 4096 };
const SCALE = { unitDistance: 5, cellSize: 70 };
const CENTRE = { x: 2048, y: 2048 };
const emission = { bright: 60, dim: 120, color: '#ffffff', intensity: 1, animation: 'none' as const, sourceRadius: 1 };

describe('how much a light lights that the rules do not count', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /**
   * The texels the light map lights to at least half the dim level where the rule counts nothing
   * as lit, as a share of the texels the rule counts: a token standing there is hidden on a
   * floor that looks lit.
   */
  async function uncounted(light: EngineLight): Promise<number> {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, BOUNDS);
    cleanup.push(() => world.destroy());
    world.update([], [light], null);
    world.flush();
    const texels = readFloats(renderer, world.lightMap.texture);
    const width = world.lightMap.texture.source.pixelWidth;
    const reach = [lightReach({ x: light.x, y: light.y }, light.dim, [], light.bright, light)];
    let counted = 0;
    let stray = 0;
    for (let o = 0; o < texels.length; o += 4) {
      const point = { x: ((o / 4) % width + 0.5) * world.texel, y: (Math.floor(o / 4 / width) + 0.5) * world.texel };
      if (lightLevelAt(point, { ambient: 0 }, reach) !== 'dark') counted++;
      else if (texels[o]! >= LIGHT_LEVELS.dim / 2) stray++;
    }
    return stray / counted;
  }

  it('is no larger a share for a beam than for a light that shines all around', async () => {
    const allAround = await uncounted(engineLight({ key: 'a', ...CENTRE, emission }, SCALE));
    const beam = await uncounted(engineLight({ key: 'b', ...CENTRE, rotation: 90, emission: { ...emission, angle: 53 } }, SCALE));
    console.info(`uncounted lit area, share of the counted: all around ${(allAround * 100).toFixed(1)} %, bullseye beam ${(beam * 100).toFixed(1)} %`);
    expect(allAround).toBeLessThan(0.12);
    expect(beam).toBeLessThanOrEqual(allAround);
  });
});
