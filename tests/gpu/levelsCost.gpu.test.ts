/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { RenderTexture, type TextureSource, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY, type LightingQuality } from '../../src/app/lighting/lightingQuality';
import { levelStack, shownAt, stackGrid } from '../../src/app/levels/levelStack';
import { stampClip } from '../../src/app/levels/stackClip';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeSight, lightReach, NO_SIGHT } from '../../src/app/vision/sight';
import { belowTokenPerception, sightBelow } from '../../src/app/vision/throughSight';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { belowNoise, LEVELS, openLevelsView, type LevelsView } from '../helpers/levelsView';

vi.mock('events', async () => import('eventemitter3'));

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const SAMPLES = 5;
const MAP = 8192;
const [WIDTH, HEIGHT] = [1440, 900];

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** GPU time of `fn` from a timer query; null when the GPU reported a disjoint event. */
async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt, fn: () => void): Promise<number | null> {
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => setTimeout(resolve, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

/** The median of `SAMPLES` timings of `fn`, disjoint ones taken again. */
async function medianGpu(gl: WebGL2RenderingContext, ext: TimerExt, fn: () => void): Promise<number> {
  const taken: number[] = [];
  for (let attempt = 0; taken.length < SAMPLES && attempt < SAMPLES * 4; attempt++) {
    const ms = await gpuMs(gl, ext, fn);
    if (ms !== null) taken.push(ms);
  }
  taken.sort((a, b) => a - b);
  return taken[Math.floor(taken.length / 2)] ?? NaN;
}

function medianCpu(fn: () => void, runs = 9): number {
  const taken: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    taken.push(performance.now() - start);
  }
  taken.sort((a, b) => a - b);
  return taken[Math.floor(taken.length / 2)]!;
}

const BYTES: Record<string, number> = { rgba8unorm: 4, bgra8unorm: 4, rgba16float: 8, rgba32float: 16, r8unorm: 1, r16float: 2, r32float: 4, rg16float: 4, rg8unorm: 2 };

/** Graphics memory of every texture the renderer holds, in MB. */
function textureMb(renderer: WebGLRenderer): number {
  const managed = (renderer.texture as unknown as { managedTextures: TextureSource[] }).managedTextures;
  return managed.filter((source) => !!source).reduce((sum, source) => sum + source.pixelWidth * source.pixelHeight * (BYTES[source.format] ?? 4) * (source.antialias ? 4 : 1), 0) / 1e6;
}

const square = (x: number, y: number, side: number): LevelSurface['polygon'] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];

/** Two floors of an 8,192 px map, each with walls, lights and tokens; an opening of 1,600 px in the middle of the upper one. */
function scene(level: 'upper' | 'ground', seed: number): { walls: Record<string, WallSegment>; lights: Record<string, LightSource>; tokens: Record<string, TokenEntity> } {
  const rand = rng(seed);
  const walls: Record<string, WallSegment> = {};
  for (let chain = 0; chain < 40; chain++) {
    let [x, y] = [2500 + rand() * 3200, 2500 + rand() * 3200];
    for (let step = 0; step < 6; step++) {
      const angle = rand() * Math.PI * 2;
      const length = 60 + rand() * 200;
      const id = `${level}-w${chain}-${step}`;
      walls[id] = { id, kind: 'wall', type: 'solid', levels: [level], p1: { x, y }, p2: { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length } };
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
    }
  }
  const lights: Record<string, LightSource> = {};
  for (let i = 0; i < 10; i++) {
    const id = `${level}-l${i}`;
    lights[id] = { id, kind: 'light', levels: [level], x: 2800 + rand() * 2600, y: 2800 + rand() * 2600, emission: { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'none' } };
  }
  const tokens: Record<string, TokenEntity> = {};
  for (let i = 0; i < (level === 'upper' ? 3 : 20); i++) {
    const id = `${level}-t${i}`;
    tokens[id] = { id, kind: 'token', imagePath: '', x: 3000 + rand() * 2200, y: 3000 + rand() * 2200, level, ...(level === 'upper' && { vision: { enabled: true } }) } as TokenEntity;
  }
  return { walls, lights, tokens };
}

async function openScene(quality: LightingQuality): Promise<LevelsView> {
  const view = await openLevelsView({ map: MAP, pane: WIDTH, paneHeight: HEIGHT, below: belowNoise(512), quality });
  const upper = scene('upper', 3);
  const ground = scene('ground', 5);
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: {
      ...view.store.getState().objects,
      walls: { ...upper.walls, ...ground.walls }, lights: { ...upper.lights, ...ground.lights }, tokens: { ...upper.tokens, ...ground.tokens },
      levelSurfaces: { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: square(3300, 3300, 1600) } },
    },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: 0.1 });
  await view.settle();
  // A tenth of the map's width on the screen: the opening fills about a third of it.
  view.viewport.scale.set(0.5);
  view.viewport.position.set(WIDTH / 2 - 4100 * 0.5, HEIGHT / 2 - 4100 * 0.5);
  return view;
}

describe('the cost of levels below (budgets asserted with VITE_PERF_STRICT)', () => {
  it.each([['high', LIGHTING_QUALITY.high], ['balanced', LIGHTING_QUALITY.balanced]] as const)('measures a view lit at %s on an 8,192 px map at 1440 × 900', async (name, quality, ctx) => {
    const view = await openScene(quality);
    try {
      const renderer = view.app.renderer as WebGLRenderer;
      const ext = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      if (!ext) ctx.skip('no GPU timer');
      const gl = renderer.gl;
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      const stage = (): void => renderer.render({ container: view.app.stage, target, clear: true });
      view.controller.renderer.prepareBelow?.();
      const memoryWith = textureMb(renderer);
      const below = await medianGpu(gl, ext!, () => view.controller.renderer.prepareBelow?.());
      const withOpenings = await medianGpu(gl, ext!, stage);
      // A frame of the player window at its budget, through the same view.
      const frameTarget = RenderTexture.create({ width: 2560, height: 1440 });
      const frame = (): void => {
        view.controller.renderer.prepareBelow?.({ key: 'frame', width: 2560, height: 1440, resolution: 1, mode: 'player' });
        renderer.render({ container: view.app.stage, target: frameTarget, clear: true });
      };
      const frameWith = await medianGpu(gl, ext!, frame);
      const objects = view.store.getState().objects;
      // A drag step of a token that sees, with the level below drawn.
      const scout = 'upper-t0';
      const dragStep = (dx: number): void => {
        const tokens = view.store.getState().objects.tokens;
        view.store.setState({ objects: { ...view.store.getState().objects, tokens: { ...tokens, [scout]: { ...tokens[scout]!, x: tokens[scout]!.x + dx } } } });
      };
      let flip = 1;
      // The pointer holds the token, as during a drag.
      view.store.setState({ heldTokens: { [scout]: { x: objects.tokens[scout]!.x, y: objects.tokens[scout]!.y } } });
      const dragWith = medianCpu(() => dragStep(flip = -flip * 7), 15);

      view.store.setState({ objects: { ...objects, levelSurfaces: {} } });
      await view.settle();
      view.controller.renderer.prepareBelow?.();
      const memoryWithout = textureMb(renderer);
      const without = await medianGpu(gl, ext!, stage);
      const frameWithout = await medianGpu(gl, ext!, frame);
      const dragWithout = medianCpu(() => dragStep(flip = -flip * 7), 15);
      view.store.setState({ heldTokens: {} });
      target.destroy(true);
      frameTarget.destroy(true);

      // An idle map with steady lights renders nothing, openings and all.
      view.store.setState({ objects });
      await view.settle();
      const render = vi.spyOn(view.app, 'render');
      view.displayFrames(30);
      const idleRenders = render.mock.calls.length;
      render.mockRestore();

      const figures = {
        quality: name,
        belowMs: below, compositeMs: withOpenings - without, frameWithMs: frameWith, frameWithoutMs: frameWithout, frameMs: frameWith - frameWithout,
        dragWithMs: dragWith, dragWithoutMs: dragWithout, dragRatio: dragWith / dragWithout, belowMemoryMb: memoryWith - memoryWithout, idleRenders,
      };
      console.info(`levels cost: ${JSON.stringify(figures)}`);
      expect(idleRenders).toBe(0);
      if (STRICT) {
        expect(figures.compositeMs).toBeLessThan(0.2);
        expect(figures.belowMs).toBeLessThan(name === 'high' ? 1 : 0.5);
        expect(figures.frameMs).toBeLessThan(1.5);
        expect(figures.dragRatio).toBeLessThan(1.3);
      }
    } finally {
      view.dispose();
    }
  });

  it('works the stack out of surfaces and the tokens below out of it quickly', () => {
    const rand = rng(9);
    const grid = stackGrid({ width: MAP, height: MAP });
    const star = (cx: number, cy: number, reach: number): LevelSurface['polygon'] => Array.from({ length: 64 }, (_, i) => {
      const angle = (i / 64) * Math.PI * 2;
      const r = reach * (0.6 + rand() * 0.4);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    const surfaces: LevelSurface[] = Array.from({ length: 64 }, (_, i) => ({ id: `s${i}`, kind: 'level-surface', open: i % 4 !== 3, polygon: star(800 + rand() * 6600, 800 + rand() * 6600, 300 + rand() * 500) }));
    let stack = levelStack({ id: 'upper', surfaces }, [{ id: 'ground', surfaces: [] }], ['ground'], grid);
    const stackMs = medianCpu(() => { stack = levelStack({ id: 'upper', surfaces }, [{ id: 'ground', surfaces: [] }], ['ground'], grid); }, 5);
    const clipMs = medianCpu(() => stampClip(stack, 1, { columns: 2048, rows: 2048, scale: 0.25, mapWidth: MAP, mapHeight: MAP }), 5);
    const sight = computeSight([{ tokenId: 'v', origin: { x: 4000, y: 4000 }, range: 20000, senses: [] }], []);
    const tokens = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`t${i}`, { id: `t${i}`, kind: 'token', imagePath: '', x: rand() * MAP, y: rand() * MAP } as TokenEntity]));
    const below = { stack, index: 1, sight: sightBelow(sight, NO_SIGHT), ambient: { ambient: 0.1 }, reaches: [lightReach({ x: 4000, y: 4000 }, 600, [])] };
    const perceiveMs = medianCpu(() => {
      const perceived = belowTokenPerception(below, tokens, { viewed: undefined, below: undefined });
      for (const id of Object.keys(tokens)) perceived(id);
    }, 9);
    console.info(`levels cost (CPU): ${JSON.stringify({ stackMs, clipMs, perceive100Ms: perceiveMs, openTexels: stack.cells.filter((cell) => cell === 1).length, sample: shownAt(stack, { x: 4000, y: 4000 }) })}`);
    if (STRICT) {
      expect(stackMs).toBeLessThan(30);
      expect(perceiveMs).toBeLessThan(1);
    }
  });
});
