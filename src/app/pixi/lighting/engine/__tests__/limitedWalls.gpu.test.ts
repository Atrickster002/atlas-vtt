import { afterEach, describe, expect, it } from 'vitest';
import { wallBand, worldTexel } from '../../../../lighting/lightingConstants';
import { sealedWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, computeSight, lightReach, type Sight } from '../../../../vision/sight';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 640;
const MAP = 1024;
/** The middle of the map, one screen pixel for one world pixel. */
const camera = { size: SIZE, scale: 1, x: -192, y: -192 };
const bounds = { width: MAP, height: MAP };
let next = 0;
const line = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment => ({ id: `w${next++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra });
/** A wall across the whole map at `x`, east of the torch. */
const across = (x: number, extra: Partial<WallSegment> = {}): WallSegment => line(x, 0, x, MAP, extra);
const hedge = (x: number, extra: Partial<WallSegment> = {}): WallSegment => across(x, { limited: true, ...extra });
const torch: EngineLight = { key: 'torch', x: 300, y: 512, bright: 250, dim: 500, flame: 12, color: [1, 0.85, 0.6], intensity: 1, animation: 'none' };
const sum = ([r, g, b]: readonly number[]): number => r! + g! + b!;

describe('limited walls in the picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The players' picture of the scene with `drawn` walls, read at world points. */
  async function picture(drawn: WallSegment[], scene: (walls: readonly WallSegment[]) => Partial<EngineScene> = () => ({ lights: [torch] })): Promise<{ at: (x: number, y: number) => number; walls: readonly WallSegment[] }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    const walls = sealedWalls(drawn, worldTexel(bounds));
    engine.update({ bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...scene(walls) });
    engine.flush();
    const read: PixelReader = renderThroughEngine(engine, renderer, camera);
    // The masked light's pass is valid under the strict context.
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    return { at: (x, y) => sum(read(Math.floor(x) + camera.x, Math.floor(y) + camera.y)), walls };
  }

  it('lets light past one limited wall, with no shadow and no line where it stands', async () => {
    const one = await picture([hedge(450)]);
    const none = await picture([]);
    for (const x of [400, 440, 447.5, 450.5, 453.5, 460, 520, 700]) {
      expect([x, one.at(x, 512) > 40]).toEqual([x, true]);
      // The bounce is the hedge's alone (it stops bounce like a wall), so the two pictures are near, not the same.
      expect([x, Math.abs(one.at(x, 512) - none.at(x, 512)) < 40]).toEqual([x, true]);
    }
  });

  it('stops light at the second limited wall: lit up to it, on its near face too, and dark from its middle on', async () => {
    const two = await picture([hedge(450), hedge(600)]);
    for (const x of [460, 520, 580, 592.5, 595.5]) expect([x, two.at(x, 512) > 40]).toEqual([x, true]);
    for (const y of [300, 512, 700]) {
      for (const x of [601.5, 602.5, 604.5, 610, 650, 780]) expect([x, y, two.at(x, y)]).toEqual([x, y, 0]);
    }
  });

  it('stops light at a solid wall behind a limited one, and at a limited wall behind a solid one never gets', async () => {
    const hedgeThenWall = await picture([hedge(450), across(600)]);
    expect(hedgeThenWall.at(520, 512)).toBeGreaterThan(40);
    for (const x of [601.5, 604.5, 650]) expect([x, hedgeThenWall.at(x, 512)]).toEqual([x, 0]);
    const wallThenHedge = await picture([across(450), hedge(600)]);
    for (const x of [451.5, 520, 650]) expect([x, wallThenHedge.at(x, 512)]).toEqual([x, 0]);
  });

  it('counts each ray by itself: light passes the second wall where the first does not stand', async () => {
    // A short hedge in front of a long one.
    const shown = await picture([line(450, 432, 450, 592, { limited: true }), hedge(600)]);
    // Behind both, only what bounces in from the lit floor on either side.
    expect(shown.at(650, 512)).toBeLessThan(25);
    expect(shown.at(650, 300)).toBeGreaterThan(100);
    expect(shown.at(650, 724)).toBeGreaterThan(100);
  });

  it('makes no hole of a corner of limited walls: nothing is lit beyond a second ring of them, at its corners either', async () => {
    const ring = (inset: number): WallSegment[] => {
      const [a, b] = [512 - inset, 512 + inset];
      return [line(a, a, b, a, { limited: true }), line(b, a, b, b, { limited: true }), line(b, b, a, b, { limited: true }), line(a, b, a, a, { limited: true })];
    };
    const shown = await picture([...ring(120), ...ring(220)], () => ({ lights: [{ ...torch, x: 500, y: 520, dim: 600, bright: 300 }] }));
    // Between the rings it is lit; beyond the outer ring, along its sides and through its corners, it is dark.
    for (const [x, y] of [[512, 350], [680, 512], [350, 650], [690, 690], [340, 340]]) expect([x, y, shown.at(x!, y!) > 40]).toEqual([x, y, true]);
    for (let d = 222; d < 300; d += 3.5) {
      for (const [x, y] of [[512 + d, 512 + d], [512 - d, 512 - d], [512 + d, 512 - d], [512 - d, 512 + d], [512 + d, 512], [512, 512 - d], [512 + d, 400], [600, 512 + d]]) {
        expect([d, x, y, shown.at(x!, y!)]).toEqual([d, x, y, 0]);
      }
    }
  });

  it('shows a token what stands behind one limited wall, and nothing behind two', async () => {
    const viewer = (walls: readonly WallSegment[]): Sight => computeSight([{ tokenId: 'v', origin: { x: 300, y: 512 }, range: 4000, senses: [] }], walls);
    const two = await picture([hedge(450), hedge(600)], (walls) => ({ ambient: 1, sight: viewer(walls) }));
    for (const x of [400, 452.5, 520, 597.5]) expect([x, two.at(x, 512) > 600]).toEqual([x, true]);
    for (const x of [602.5, 650, 780]) expect([x, two.at(x, 512)]).toEqual([x, 0]);
  });

  it('agrees with the rule along rays from the light, through walls of every sort', async () => {
    const drawn = [line(450, 300, 450, 640, { limited: true }), hedge(600), line(520, 150, 700, 330), line(380, 700, 700, 760, { limited: true }), line(700, 600, 760, 900, { limited: true, type: 'door', closed: true })];
    const shown = await picture(drawn);
    const reach = lightReach({ x: torch.x, y: torch.y }, torch.dim, shown.walls, torch.bright);
    const band = wallBand(worldTexel(bounds)) + 2;
    let lit = 0, dark = 0;
    for (let k = 0; k < 96; k++) {
      const angle = (k / 96) * Math.PI * 2 + 0.013;
      for (let d = 20; d < 480; d += 9) {
        const p = { x: torch.x + Math.cos(angle) * d, y: torch.y + Math.sin(angle) * d };
        if (p.x < 200 || p.y < 200 || p.x > 820 || p.y > 820) continue;
        // On a wall the picture is the wall's; beside a shadow's edge the flame's width decides.
        if (shown.walls.some((w) => distSqToSegment(p, w.p1, w.p2) < band * band)) continue;
        const beside = [-0.03, 0.03].map((turn) => lightLevelAt({ x: torch.x + Math.cos(angle + turn) * d, y: torch.y + Math.sin(angle + turn) * d }, { ambient: 0 }, [reach]) !== 'dark');
        const rule = lightLevelAt(p, { ambient: 0 }, [reach]) !== 'dark';
        if (beside.some((it) => it !== rule)) continue;
        if (rule) lit++;
        else dark++;
        // Where the rule counts no light the picture shows at most the bounce, which is faint.
        expect([k, d, rule, rule ? shown.at(p.x, p.y) > 12 : shown.at(p.x, p.y) < 12]).toEqual([k, d, rule, true]);
      }
    }
    expect(lit).toBeGreaterThan(800);
    expect(dark).toBeGreaterThan(200);
  });
});
