import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import type { SceneLighting } from '../../../types/lightingTypes';
import { LightingEngine } from '../engine/LightingEngine';
import { watchGl, type GlWatch } from '../engine/__tests__/strictGl';
import { createHarness, visionToken, type Harness } from './rendererHarness';

/** A wall at x = 128 from top to bottom: the right half is out of sight from the left. */
const WALLS = { wall: { id: 'wall', kind: 'wall', type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: 256 } } };
const NO_LIGHTS = {};
const START = { x: 48, y: 128 };
const HERO = visionToken(START.x, START.y);

describe('LightingRenderer shows the party where the picture is dark', () => {
  let harness: Harness | null = null;
  let watch: GlWatch | null = null;
  let spots: { x: number; y: number }[] | undefined;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    const update = Reflect.get(LightingEngine.prototype, 'update') as LightingEngine['update'];
    vi.spyOn(LightingEngine.prototype, 'update').mockImplementation(function (this: LightingEngine, scene) {
      spots = scene.spots?.map(({ x, y }) => ({ x, y }));
      update.call(this, scene);
    });
  });

  afterEach(() => {
    watch?.stop();
    watch = null;
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function tokenAt(x: number, token: TokenEntity = HERO): Record<string, unknown> {
    return { objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: { ...token, x } } } };
  }

  async function setup(lighting: Partial<SceneLighting>): Promise<Harness> {
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 0, ...lighting }, ...tokenAt(START.x) } });
    await harness.settle();
    watch = watchGl(harness.renderer.gl);
    return harness;
  }

  it('gives the engine the footprint of a party token that stands in darkness, and none in light', async () => {
    const h = await setup({ ambient: 0 });
    expect(spots).toEqual([START]);
    h.renderStage();
    h.change({ lighting: { enabled: true, ambient: 1 } });
    expect(spots).toEqual([]);
    h.change({ lighting: { enabled: true, ambient: 0.15 } });
    expect(spots).toEqual([START]);
    h.renderStage();
    expect(watch!.findings).toEqual([]);
  });

  it('lets the footprint follow a dragged party token without building sight anew, and ends it beyond the sight left behind', async () => {
    const h = await setup({ ambient: 0 });
    h.renderStage();
    const sight = h.lighting.currentSight();
    h.change({ heldTokens: { t: START } });
    h.change(tokenAt(100));
    expect(spots).toEqual([{ x: 100, y: 128 }]);
    expect(h.lighting.currentSight()).toBe(sight);
    h.renderStage();
    // Past the wall the sight that stayed behind does not reach: the token is hidden until the drop.
    h.change(tokenAt(200));
    expect(spots).toEqual([]);
    expect(h.lighting.currentSight()).toBe(sight);
    h.renderStage();
    h.change({ heldTokens: {} });
    expect(spots).toEqual([{ x: 200, y: 128 }]);
    expect(h.lighting.currentSight()).not.toBe(sight);
    h.renderStage();
    expect(watch!.findings).toEqual([]);
  });

  it('gives none while the scene has token vision off: nothing is hidden by sight then', async () => {
    await setup({ ambient: 0, tokenVision: false });
    expect(spots).toEqual([]);
  });
});
