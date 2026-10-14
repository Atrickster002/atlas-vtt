import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { levelStack, shownAt, stackGrid, VIEWED } from '../../../../levels/levelStack';
import type { LevelSurface } from '../../../../types/sceneLevelTypes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { LevelStackTexture } from '../../levels/LevelStackTexture';
import { LightingEngine } from '../LightingEngine';
import type { EngineScene } from '../types';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 192;
const MAP = 512;
const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function scene(overrides: Partial<EngineScene> = {}): EngineScene {
  return { bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 1, ...overrides };
}

/**
 * A picture standing for the level below: every pixel its own colour, so a pixel taken from the
 * wrong place, row or orientation shows.
 */
function patternPicture(renderer: WebGLRenderer, resolution: number): RenderTexture {
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const g = new Graphics();
  const cells = 24;
  const step = SIZE / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) g.rect(x * step, y * step, step, step).fill({ color: ((x * 10 + 15) << 16) | ((y * 10 + 15) << 8) | 0x40 });
  }
  renderer.render({ container: g, target, clear: true, clearColor: [0, 0, 0, 1] });
  g.destroy();
  return target;
}

/** Renders a white map, the eraser and the engine's layer through a camera at `scale`, offset (x, y). */
function shoot(renderer: WebGLRenderer, engine: LightingEngine, eraser: Sprite | null, scale: number, x: number, y: number, resolution: number): Uint8ClampedArray {
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const stage = new Container();
  const world = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(MAP, MAP);
  world.addChild(map);
  if (eraser) world.addChild(eraser);
  world.addChild(engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
  renderer.render({ container: stage, target, clear: true });
  const pixels = readRgba(renderer, target);
  world.removeChildren();
  stage.destroy({ children: true });
  target.destroy(true);
  return pixels;
}

describe('the composite over openings', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it.each([1, 2])('shows the picture below texel on pixel where the stack shows it, and the viewed level as before everywhere else (resolution %i)', async (resolution) => {
    const renderer = await createTestRenderer(SIZE, resolution);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    // Destroyed after the engine, whose composite reads it.
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update(scene());
    engine.flush();

    const [scale, x, y] = [0.61, -13.3, 7.7];
    const before = shoot(renderer, engine, null, scale, x, y, resolution);
    const stack = levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(60.3, 80.7, 140, 97) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: MAP, height: MAP }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const picture = patternPicture(renderer, resolution);
    cleanup.push(() => picture.destroy(true));
    engine.setBelow(picture, 1);
    const after = shoot(renderer, engine, stackTexture.eraser, scale, x, y, resolution);
    const below = readRgba(renderer, picture);

    const device = SIZE * resolution;
    let holes = 0;
    let wrong = 0;
    let moved = 0;
    for (let sy = 0; sy < device; sy++) {
      for (let sx = 0; sx < device; sx++) {
        const world = { x: ((sx + 0.5) / resolution - x) / scale, y: ((sy + 0.5) / resolution - y) / scale };
        if (world.x < 0 || world.y < 0 || world.x > MAP || world.y > MAP) continue;
        const o = (sy * device + sx) * 4;
        // Pixels whose centre lies on a texel's edge may read either texel.
        const cell = { x: world.x / stack.grid.texel, y: world.y / stack.grid.texel };
        if (Math.abs(cell.x - Math.round(cell.x)) < 1e-3 || Math.abs(cell.y - Math.round(cell.y)) < 1e-3) continue;
        if (shownAt(stack, world) === VIEWED) {
          if (Math.abs(after[o]! - before[o]!) + Math.abs(after[o + 1]! - before[o + 1]!) + Math.abs(after[o + 2]! - before[o + 2]!) > 0) moved++;
        } else {
          holes++;
          if (Math.abs(after[o]! - below[o]!) > 1 || Math.abs(after[o + 1]! - below[o + 1]!) > 1 || Math.abs(after[o + 2]! - below[o + 2]!) > 1) wrong++;
        }
      }
    }
    expect(holes).toBeGreaterThan(1000);
    expect({ wrong, moved }).toEqual({ wrong: 0, moved: 0 });
    expect(watch.findings).toEqual([]);
  });

  it('shows nothing below where no picture of it was drawn for this render, black for the GM', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    // Destroyed after the engine, whose composite reads it.
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('gm');
    engine.update(scene());
    engine.flush();
    const stack = levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(0, 0, 256, 256) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: MAP, height: MAP }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const pixels = shoot(renderer, engine, stackTexture.eraser, 0.375, 0, 0, 1);
    const at = (sx: number, sy: number): number[] => Array.from(pixels.slice((sy * SIZE + sx) * 4, (sy * SIZE + sx) * 4 + 3));
    expect(Math.max(...at(20, 20))).toBeLessThanOrEqual(1);
    expect(Math.min(...at(150, 150))).toBeGreaterThan(200);
  });

  it('draws a level below only in its own texels', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    // A level below renders only while the view's own lighting holds the back buffer, which PIXI's blend filters need even off-screen.
    renderer.backBuffer.useBackBuffer = true;
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer, undefined, { levelIndex: 1, backBuffer: false });
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    // Everything is seen and lit: only the stack decides what of the level shows.
    engine.update(scene({ sight: computeSight([{ tokenId: 't', origin: { x: 256, y: 256 }, range: 2000, senses: [] }], []) }));
    engine.flush();
    const stack = levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(0, 0, 256, 512) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: MAP, height: MAP }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const pixels = shoot(renderer, engine, null, 0.375, 0, 0, 1);
    const at = (sx: number, sy: number): number => pixels[(sy * SIZE + sx) * 4]!;
    expect(at(40, 96)).toBeGreaterThan(200);
    // Unexplored, unseen: black in the players' view.
    expect(at(150, 96)).toBeLessThanOrEqual(1);
  });
});
