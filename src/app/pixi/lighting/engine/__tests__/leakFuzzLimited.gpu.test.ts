/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { sealTolerance, wallBand, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { darkvision } from '../../../../vision/__tests__/senseSources';
import { exploredShapes } from '../../../../vision/exploredShapes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, computeSight, lightReach, type LightReach, type SightSource } from '../../../../vision/sight';
import { blocksFrom, pointInPolygon, type MapBounds } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { ExploredTexture } from '../../ExploredTexture';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { NO_SIGHT, footprints, inPenumbra, renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** How much larger the second ring of walls is than the room. */
const RING = 1.3;

interface Report {
  rooms: number;
  /** Rooms inside a second ring of limited walls, and rooms inside a ring of solid walls. */
  hedged: number;
  walled: number;
  /** Pixels past the second ring, and those lit, seen, seen by darkvision, shown as a footprint, remembered, or changed by a darkness. */
  checked: number;
  lightLeaks: number;
  sightLeaks: number;
  senseLeaks: number;
  spotLeaks: number;
  memoryLeaks: number;
  darkLeaks: number;
  /** Pixels between the room's own limited walls and the ring that are lit and that are seen: both pass the first limited wall. */
  litBetween: number;
  seenBetween: number;
  /** Points the rule counts as lit, and those the picture shows dark. */
  ruleLit: number;
  lightWrong: number;
  /** Points the rule decides as seen or unseen, and those the picture shows otherwise. */
  ruleSight: number;
  sightWrong: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  gap?: boolean | number;
  bounds?: MapBounds;
  resolution?: number;
}

const sum = (pixels: Uint8ClampedArray, o: number): number => pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;

/**
 * Limited walls through the real engine, over the leak fuzz's rooms. Every wall of a room is
 * limited, its outline (with its doors and one-way walls) and the chains across it, and a
 * second ring stands around the room, the outline again a third larger: limited walls for one
 * room, solid ones for the next. The lights and the tokens stand in the room.
 *
 * Nothing passes the ring: no light, no sight, no darkvision, no footprint, no memory, and no
 * darkness beyond the ring's core. That is the second limited wall on every way out (its
 * corners included, which the rays through them must not pass), or a solid wall behind a
 * limited one. Between the room's walls and the ring it is lit and seen: both passed the first
 * limited wall. And the rule is asked at sampled points: where it counts light that passes
 * every solid wall by a band, the picture is lit; where it counts a point as seen or unseen,
 * away from the edges of sight, the picture agrees.
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1 }: FuzzOptions): Promise<Report> {
  vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const memory = new ExploredTexture(renderer, bounds);
  const blank = new ExploredTexture(renderer, bounds);
  const device = SIZE * resolution;
  const memoryTexel = Math.max(bounds.width, bounds.height) / Math.max(memory.texture.width, memory.texture.height);
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 7);
    const report: Report = { rooms: 0, hedged: 0, walled: 0, checked: 0, lightLeaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, memoryLeaks: 0, darkLeaks: 0, litBetween: 0, seenBetween: 0, ruleLit: 0, lightWrong: 0, ruleSight: 0, sightWrong: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      const texel = worldTexel(bounds);
      const inner = roomOutline(room);
      // The ring is the room's outline grown about its centre, which three corners need not surround.
      if (!room.lights.every((p) => insidePolygon(p, inner)) || !insidePolygon(room.centre, room.outline)) continue;
      const hedged = report.rooms % 2 === 0;
      report.rooms++;
      report[hedged ? 'hedged' : 'walled']++;
      const [cx, cy] = room.centre;
      const grown = (p: { x: number; y: number }): { x: number; y: number } => ({ x: cx + (p.x - cx) * RING, y: cy + (p.y - cy) * RING });
      const ringWalls = room.walls.slice(0, room.roomWallCount).map((wall): WallSegment => ({ ...wall, id: `ring:${wall.id}`, p1: grown(wall.p1), p2: grown(wall.p2), ...(hedged && { limited: true }) }));
      const drawn = [...room.walls.map((wall): WallSegment => ({ ...wall, limited: true })), ...ringWalls];
      const walls = sealWalls(drawn, sealTolerance(texel));
      const outer = ringWalls.flatMap((wall): P[] => [[wall.p1.x, wall.p1.y], [wall.p2.x, wall.p2.y]]);
      const lights: EngineLight[] = room.lights.map(([lx, ly], i) => {
        const dim = 250 + rand() * 600;
        return { key: `l${i}`, x: lx, y: ly, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const [first] = room.lights;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - first![0] * scale + (rand() - 0.5) * 300;
      const y = SIZE / 2 - first![1] * scale + (rand() - 0.5) * 300;
      const sightRadius = 20 + rand() * 40;
      const sources: SightSource[] = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, senses: [] }));
      const shoot = (scene: Partial<EngineScene>): Uint8ClampedArray => {
        engine.update({ bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius, ambient: 0, ...scene });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      engine.setExplored(blank.texture);
      const sight = computeSight(sources, walls);
      const lit = shoot({ lights });
      const seen = shoot({ ambient: 1, sight });
      const sensed = shoot({ sight: computeSight(sources.map((source) => ({ ...source, senses: [darkvision(4000)] })), walls) });
      const spotted = shoot({ lights, ambient: 1, sight: NO_SIGHT, spots: footprints(room, inner, walls, rand) });
      const last = room.lights[room.lights.length - 1]!;
      const darkness: EngineLight = { key: 'darkness', x: last[0], y: last[1], bright: 0, dim: 200 + rand() * 500, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
      const day = shoot({ lights, ambient: 1 });
      const darkened = shoot({ lights: [...lights, darkness], ambient: 1 });
      memory.clear();
      const recorded = exploredShapes(computeSight([sources[0]!], walls), { ambient: 1 }, []);
      if (recorded) memory.add(recorded);
      engine.setExplored(memory.texture);
      const remembered = shoot({ sight: NO_SIGHT });

      const reaches = lights.map((light) => lightReach({ x: light.x, y: light.y }, light.dim, walls, light.bright));
      // A solid wall is a line to the rule and a capsule to the picture; a limited wall is a line to both.
      const widelyLit = (point: { x: number; y: number }, reach: LightReach, clear: number): boolean => Math.hypot(point.x - reach.origin.x, point.y - reach.origin.y) <= reach.dim && pointInPolygon(point, reach.polygon)
        && walls.every((wall) => wall.limited || !blocksFrom(wall, reach.origin, 'light') || Math.min(distSqToSegment(wall.p1, reach.origin, point), distSqToSegment(wall.p2, reach.origin, point), distSqToSegment(reach.origin, wall.p1, wall.p2), distSqToSegment(point, wall.p1, wall.p2)) > clear * clear);
      const edges = sight.regions.map((region) => region.polygon!.map((q): P => [q.x, q.y]));
      const filter = 1.5 / scale + 0.01;
      const nearWall = (p: P, reach: number): boolean => walls.some((wall) => distSqToSegment({ x: p[0], y: p[1] }, wall.p1, wall.p2) < reach * reach);
      const memoryBound = Math.min(1.5 * memoryTexel, wallCore(texel)) + filter;
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const within = insidePolygon(p, outer);
          const d = distToOutline(p, outer);
          if (!within && d > 0.01) {
            report.checked++;
            if (sum(lit, o) > 0) report.lightLeaks++;
            if (d > filter) {
              if (sum(seen, o) > 0) report.sightLeaks++;
              if (sum(sensed, o) > 0) report.senseLeaks++;
              if (sum(spotted, o) > 0) report.spotLeaks++;
            }
            if (d > memoryBound && sum(remembered, o) > 0) report.memoryLeaks++;
            if (d > wallCore(texel) + filter && Math.abs(sum(day, o) - sum(darkened, o)) > 3) report.darkLeaks++;
          }
          if (within && !insidePolygon(p, inner)) {
            if (sum(lit, o) > 0) report.litBetween++;
            if (sum(seen, o) > 0) report.seenBetween++;
          }
          // Every fourth pixel: the rule is asked for each.
          if (sx % 4 !== 0 || sy % 4 !== 0) continue;
          const point = { x: p[0], y: p[1] };
          if (lightLevelAt(point, { ambient: 0 }, reaches) !== 'dark' && !nearWall(p, wallBand(texel) + filter) && reaches.some((reach) => widelyLit(point, reach, wallBand(texel) + filter))) {
            report.ruleLit++;
            if (sum(lit, o) === 0) report.lightWrong++;
          }
          if (edges.every((edge) => distToOutline(p, edge) > filter + 1) && !inPenumbra(p, sight, sightRadius)) {
            report.ruleSight++;
            if (sight.regions.some((region) => pointInPolygon(point, region.polygon!)) !== sum(seen, o) > 0) report.sightWrong++;
          }
        }
      }
    }
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    memory.destroy();
    blank.destroy();
    renderer.destroy();
    vi.unstubAllGlobals();
  }
}

/** What every run of closed rooms holds. */
const CLEAN = { lightLeaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, memoryLeaks: 0, darkLeaks: 0, lightWrong: 0, sightWrong: 0 };

describe('leak fuzz: limited walls', () => {
  it('lets nothing past the second limited wall or a solid wall behind the first, and lets light and sight past the first', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 29, trials: TRIALS });
    console.info(`leak fuzz (limited walls): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.6);
    expect(Math.min(report.hedged, report.walled)).toBeGreaterThan(TRIALS / 4);
    expect(report.checked).toBeGreaterThan(TRIALS * 1000);
    expect(report.litBetween).toBeGreaterThan(TRIALS * 500);
    expect(report.seenBetween).toBeGreaterThan(TRIALS * 500);
    expect(report.ruleLit).toBeGreaterThan(TRIALS * 100);
    expect(report.ruleSight).toBeGreaterThan(TRIALS * 1000);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds on a map of 12,000 px, large enough for coarser texels of the lighting and of the memory', { timeout: 3_600_000 }, async () => {
    const bounds = { width: 12_000, height: 12_000 };
    expect(worldTexel(bounds)).toBeGreaterThan(2);
    const report = await fuzz({ seed: 7, trials: SIDE_TRIALS, bounds });
    console.info(`leak fuzz (limited walls, 12000 px map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.checked).toBeGreaterThan(SIDE_TRIALS * 500);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds at renderer resolution 2', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (limited walls, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.checked).toBeGreaterThan(SIDE_TRIALS * 500);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds light, sight and memory past a ring with a gap (the checks can fail)', async () => {
    const report = await fuzz({ seed: 29, trials: 24, gap: 0.9 });
    console.info(`negative control (limited walls): ${JSON.stringify(report)}`);
    expect(report.lightLeaks).toBeGreaterThan(100);
    expect(report.sightLeaks).toBeGreaterThan(100);
    expect(report.memoryLeaks).toBeGreaterThan(100);
  });
});
