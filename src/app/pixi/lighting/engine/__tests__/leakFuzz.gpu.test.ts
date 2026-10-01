/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { sealWalls } from '../../../../lighting/sealWalls';
import { placeLight } from '../../../../lighting/lightPlacement';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { LIGHT_REACH, sealTolerance, worldTexel } from '../../../../lighting/lightingConstants';
import { SEES_ALL, computeSight, type SenseSource, type Sight } from '../../../../vision/sight';
import type { SeenSpot } from '../../../../vision/perception';
import { blocksFrom, computeVisibility } from '../../../../vision/visibility';
import type { WallSegment } from '../../../../types/wallTypes';
import { darkvision, senseSource } from '../../../../vision/__tests__/senseSources';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { SenseDefinition } from '../../../../types/senseTypes';
import type { MapBounds } from '../../../../vision/visibility';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type FuzzRoom, type P } from './fuzzRooms';

const SIZE = 384;
/** Vision tokens that perceive nothing: nothing of the map is shown but the footprints. */
const NO_SIGHT: Sight = { all: false, regions: [] };
/** The footprint radius of tokens of size 1, 2 and 4 on a 70 px grid. */
const FOOTPRINTS = [31, 93, 217];

/**
 * Footprints of tokens inside the room, as walls leave them: at a wall (8, 2 and 0.5 px from
 * it), in corners (0.5 and 8 px from the corner), at the middle of a closed door if the room has
 * one, and where the lights stand; in the three sizes in turn. Like the lights, a token stands
 * only where every one-way wall of the room blocks: from its other side a one-way wall lets
 * sight out of the room by its own rule (an arm of a star-shaped room can lie there).
 */
function footprints(room: FuzzRoom, outline: readonly P[], walls: readonly WallSegment[], rand: () => number): SeenSpot[] {
  const centre: P = [outline.reduce((sum, p) => sum + p[0], 0) / outline.length, outline.reduce((sum, p) => sum + p[1], 0) / outline.length];
  const inward = (p: P, by: number): P => {
    const d = Math.hypot(centre[0] - p[0], centre[1] - p[1]) || 1;
    return [p[0] + ((centre[0] - p[0]) / d) * by, p[1] + ((centre[1] - p[1]) / d) * by];
  };
  const corners = room.outline;
  const onWall = (): P => {
    const i = Math.floor(rand() * corners.length), f = 0.2 + rand() * 0.6, a = corners[i]!, b = corners[(i + 1) % corners.length]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const door = room.walls.slice(0, room.roomWallCount).find((wall) => wall.type === 'door');
  const places: P[] = [
    inward(onWall(), 8), inward(onWall(), 2), inward(onWall(), 0.5),
    inward(corners[Math.floor(rand() * corners.length)]!, 0.5), inward(corners[Math.floor(rand() * corners.length)]!, 8),
    ...(door ? [inward([(door.p1.x + door.p2.x) / 2, (door.p1.y + door.p2.y) / 2], 1)] : []),
    ...room.lights,
  ];
  const oneWay = room.walls.filter((wall) => wall.direction);
  const kept = places.filter((p) => insidePolygon(p, outline) && oneWay.every((wall) => blocksFrom(wall, { x: p[0], y: p[1] })));
  return kept.map(([x, y], i) => {
    const radius = FOOTPRINTS[i % FOOTPRINTS.length]!;
    return { x, y, radius, polygon: computeVisibility({ x, y }, radius, walls) };
  });
}
const sense = (id: string): SenseDefinition => [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()].find((candidate) => candidate.id === id)!;
/** The senses with line of sight that draw the map, in every channel: one set per room in turn. */
const SENSE_SETS: SenseSource[][] = [
  [darkvision(4000)],
  [senseSource('blindsight', 4000), senseSource('low-light-vision', 4000)],
  [senseSource('truesight', 4000)],
  [{ definition: sense('pathfinder2e-greater-darkvision'), range: 4000 }, { definition: sense('dnd5e-devils-sight'), range: 4000 }],
  [{ definition: sense('ose-infravision'), range: 4000 }, { definition: sense('dnd5e-darkvision'), range: 4000 }],
];
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);

interface Report {
  rooms: number;
  /** Rooms with a closed door, with one-way walls, with two lights among their outline. */
  doors: number;
  oneWay: number;
  twoLights: number;
  checked: number;
  leaks: number;
  sightChecked: number;
  sightLeaks: number;
  /** Pixels past the walls shown by a sense that perceives without light. */
  senseLeaks: number;
  /** Pixels inside the room that only such a sense shows: beyond every light's reach, without bounce. */
  senseInside: number;
  /** Token footprints drawn, and the pixels past the walls and inside the room they showed. */
  spots: number;
  spotLeaks: number;
  spotInside: number;
  litInside: number;
  /** Lit pixels inside the room beyond every light's reach: only bounce lights them. */
  bounceInside: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Opens one wall of every room (the negative control). */
  gap?: boolean | number;
  bounds?: MapBounds;
  /** Device pixels per screen pixel of the renderer and its target (2 on Retina displays). */
  resolution?: number;
  /** Draws each footprint as a whole disc, ignoring the walls (a negative control). */
  wholeFootprints?: boolean;
}

/**
 * Renders every room through the real engine at a random camera and counts pixels past the
 * room's walls (as drawn, joined by their bridges) that are not black: light (direct + bounce,
 * player mode, everything seen, no ambient), sight (ambient 1, a token at each light; sight
 * stops at the centre line, so only filtering may show past it: 1.5 screen px) and senses (no
 * ambient, the lights on, each token with the senses of one room in turn: darkvision in grey,
 * blindsight and truesight in colour, black-and-white darkvision without a distance, low-light
 * vision; held to the same line as sight) and the footprints of tokens shown where no sense
 * shows the map (a lit map, the lights on, no sight at all: tokens of size 1, 2 and 4 that hug a
 * wall, stand in a corner, straddle a door or stand anywhere; held to the same line as sight).
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1, wholeFootprints = false }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 1);
    const report: Report = { rooms: 0, doors: 0, oneWay: 0, twoLights: 0, checked: 0, leaks: 0, sightChecked: 0, sightLeaks: 0, senseLeaks: 0, senseInside: 0, spots: 0, spotLeaks: 0, spotInside: 0, litInside: 0, bounceInside: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      const texel = worldTexel(bounds);
      const walls = sealWalls(room.walls, sealTolerance(texel));
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      report.rooms++;
      const outlineWalls = room.walls.slice(0, room.roomWallCount);
      if (outlineWalls.some((w) => w.type === 'door')) report.doors++;
      if (outlineWalls.some((w) => w.direction)) report.oneWay++;
      if (room.lights.length > 1) report.twoLights++;
      const lights: EngineLight[] = room.lights.map(([x, y], i) => {
        const dim = 150 + rand() * 500;
        return { key: `l${i}`, x, y, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const [first] = room.lights;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - first![0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - first![1] * scale + (rand() - 0.5) * 200;
      const sightRadius = 20 + rand() * 40;
      const sources = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, senses: [] }));
      const shoot = (sightOn: boolean): Uint8ClampedArray => {
        engine.update({
          bounds, albedo: null, walls, lights: sightOn ? [] : lights,
          sight: sightOn ? computeSight(sources, walls) : SEES_ALL, sightRadius, ambient: sightOn ? 1 : 0,
        });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      const lit = shoot(false);
      const seen = shoot(true);
      const senses = SENSE_SETS[report.rooms % SENSE_SETS.length]!;
      engine.update({ bounds, albedo: null, walls, lights, sight: computeSight(sources.map((source) => ({ ...source, senses })), walls), sightRadius, ambient: 0 });
      engine.flush();
      const sensed = renderView(renderer, engine, target, bounds, scale, x, y);
      const spots = footprints(room, outline, wholeFootprints ? [] : walls, rand);
      report.spots += spots.length;
      engine.update({ bounds, albedo: null, walls, lights, sight: NO_SIGHT, spots, sightRadius, ambient: 1 });
      engine.flush();
      const spotted = renderView(renderer, engine, target, bounds, scale, x, y);
      // Direct light ends at the reach around where the engine places each light (plus the light map's bilinear texel).
      const placed = lights.map((l) => ({ at: placeLight(l.x, l.y, l.flame, allSegments(splitBlocking(walls)), texel), reach: l.dim * LIGHT_REACH + 2 * texel }));
      const beyondReach = (p: P): boolean => placed.every(({ at, reach }) => !at || Math.hypot(p[0] - at.x, p[1] - at.y) > reach);
      for (let sy = 0; sy < device; sy += 1) {
        for (let sx = 0; sx < device; sx += 1) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const inside = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          if (inside && lit[o]! > 0) {
            report.litInside++;
            if (beyondReach(p)) report.bounceInside++;
          }
          if (!inside && d > 0.01) {
            report.checked++;
            if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.leaks++;
          }
          if (!inside && d > 1.5 / scale + 0.01) {
            report.sightChecked++;
            if (seen[o]! + seen[o + 1]! + seen[o + 2]! > 0) report.sightLeaks++;
            if (sensed[o]! + sensed[o + 1]! + sensed[o + 2]! > 0) report.senseLeaks++;
            if (spotted[o]! + spotted[o + 1]! + spotted[o + 2]! > 0) report.spotLeaks++;
          }
          if (inside && spotted[o]! + spotted[o + 1]! + spotted[o + 2]! > 0) report.spotInside++;
          if (inside && lit[o]! === 0 && sensed[o]! + sensed[o + 1]! + sensed[o + 2]! > 0) report.senseInside++;
        }
      }
    }
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    renderer.destroy();
  }
}

/** A white map under the lighting layer, seen through a camera at `scale` offset by (x, y). */
function renderView(renderer: WebGLRenderer, engine: LightingEngine, target: RenderTexture, bounds: MapBounds, scale: number, x: number, y: number): Uint8ClampedArray {
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(bounds.width, bounds.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  try {
    engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
    renderer.render({ container: stage, target, clear: true });
    return readRgba(renderer, target);
  } finally {
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
  }
}

describe('leak fuzz', () => {
  it('lets no light, bounce, sight, sense or token footprint past the walls of closed rooms', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: TRIALS });
    console.info(`leak fuzz: ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.8);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(TRIALS / 8);
    expect(report.checked).toBeGreaterThan(TRIALS * 1000);
    expect(report.litInside).toBeGreaterThan(TRIALS * 100);
    expect(report.bounceInside).toBeGreaterThan(TRIALS * 10);
    expect(report.senseInside).toBeGreaterThan(TRIALS * 100);
    expect(report.spots).toBeGreaterThan(TRIALS * 4);
    expect(report.spotInside).toBeGreaterThan(TRIALS * 100);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0 });
  });

  it('holds on a map large enough for coarser texels', { timeout: 600_000 }, async () => {
    const bounds = { width: 9000, height: 9000 };
    expect(worldTexel(bounds)).toBeGreaterThan(2);
    const report = await fuzz({ seed: 7, trials: 8, bounds });
    console.info(`leak fuzz (large map): ${JSON.stringify(report)}`);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(0);
    expect(report.checked).toBeGreaterThan(8000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report.senseInside).toBeGreaterThan(800);
    expect(report.spotInside).toBeGreaterThan(400);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0 });
  });

  it('holds at renderer resolution 2', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: 8, resolution: 2 });
    console.info(`leak fuzz (resolution 2): ${JSON.stringify(report)}`);
    expect(report.checked).toBeGreaterThan(8 * 4000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0 });
  });

  it('finds light and sight past a wall with a gap (the check can fail)', async () => {
    // Nine tenths of one wall open.
    const report = await fuzz({ seed: 11, trials: 6, gap: 0.9 });
    console.info(`negative control: ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(1000);
    expect(report.sightLeaks).toBeGreaterThan(1000);
    expect(report.senseLeaks).toBeGreaterThan(1000);
  });

  it('finds a footprint past a wall when it is drawn as a whole disc (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 6, wholeFootprints: true });
    console.info(`negative control (whole footprints): ${JSON.stringify(report)}`);
    expect(report.spotLeaks).toBeGreaterThan(1000);
  });
});
