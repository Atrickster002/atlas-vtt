/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { sealWalls } from '../../../../lighting/sealWalls';
import { placeLight } from '../../../../lighting/lightPlacement';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { DARKNESS, LIGHT_REACH, TILE_SMOOTH, sealTolerance, wallRadius, worldTexel } from '../../../../lighting/lightingConstants';
import { SEES_ALL, computeSight, type SenseSource, type Sight } from '../../../../vision/sight';
import type { SeenSpot } from '../../../../vision/perception';
import { blocksFrom } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import type { MeasurementSettings } from '../../../../grid/measurementFormat';
import type { TokenEntity } from '../../../../types';
import { SceneSpots, type SceneModel } from '../../sceneModel';
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
/** Token sizes whose footprints are 31, 93 and 217 px in radius on a 70 px grid. */
const SIZES = [1, 2, 4];
const MEASUREMENT = (): MeasurementSettings => ({ unitDistance: 5 }) as MeasurementSettings;

/**
 * Footprints of party tokens inside the room, as the lighting view hands them to the engine
 * (`SceneSpots`, the production path: breaking its clipping fails the fuzz): at a wall (8, 2 and 0.5 px from
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
  const tokens = Object.fromEntries(kept.map(([x, y], i) => [`p${i}`, { id: `p${i}`, kind: 'token', imagePath: '', x, y, size: SIZES[i % SIZES.length]!, vision: { enabled: true } } as TokenEntity]));
  const model: SceneModel = { walls, lights: [], reaches: [], sight: NO_SIGHT, explored: null };
  return new SceneSpots().update(model, { objects: { tokens, walls: {}, lights: {} }, lighting: { enabled: true, ambient: 0 }, grid: null, heldTokens: {} } as unknown as Parameters<SceneSpots['update']>[1], MEASUREMENT);
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

/**
 * Whether the straight path from `from` to `to` keeps `margin` px clear of every wall: checked
 * every 3 px along it, so a point for which this holds has the whole source in plain view.
 */
function clearPath(from: P, to: P, walls: readonly WallSegment[], margin: number): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(length / 3));
  for (let i = 0; i <= steps; i++) {
    const point = { x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps };
    for (const wall of walls) if (distSqToSegment(point, wall.p1, wall.p2) < margin * margin) return false;
  }
  return true;
}

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
  /** Rooms with a source of magical darkness, in daylight with every light on. */
  darkRooms: number;
  /** Pixels past the walls of such a room that differ from the same room without the darkness. */
  darkLeaks: number;
  /** Pixels in plain view of the darkness source, well within its radius, and those of them that show more than its veil. */
  darkInside: number;
  darkRevealed: number;
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
  /** Gives every light a priority above the darkness, so it shines in it (a negative control). */
  outshine?: boolean;
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
 * Every other room also gets a source of magical darkness where its last light stands: in
 * daylight with every light on, nothing past the walls may differ from the room without it
 * (darkness ends at walls like light), and what the source has in plain view well within its
 * radius shows nothing but its veil (the lights and the day are swallowed, not let through);
 * that room's senses are fuzzed with the darkness in place, some of which see in it.
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1, wholeFootprints = false, outshine = false }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 1);
    const report: Report = { rooms: 0, doors: 0, oneWay: 0, twoLights: 0, checked: 0, leaks: 0, sightChecked: 0, sightLeaks: 0, senseLeaks: 0, senseInside: 0, spots: 0, spotLeaks: 0, spotInside: 0, litInside: 0, bounceInside: 0, darkRooms: 0, darkLeaks: 0, darkInside: 0, darkRevealed: 0 };
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
      const last = room.lights[room.lights.length - 1]!;
      const darkness: EngineLight | null = report.rooms % 2 === 0
        ? { key: 'darkness', x: last[0], y: last[1], bright: 0, dim: 100 + rand() * 400, flame: 2 + rand() * 40, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true }
        : null;
      const withDarkness = darkness ? [...lights.map((light) => (outshine ? { ...light, priority: 1 } : light)), darkness] : lights;
      engine.update({ bounds, albedo: null, walls, lights: withDarkness, sight: computeSight(sources.map((source) => ({ ...source, senses })), walls), sightRadius, ambient: 0 });
      engine.flush();
      const sensed = renderView(renderer, engine, target, bounds, scale, x, y);
      let day: Uint8ClampedArray | null = null;
      let darkened: Uint8ClampedArray | null = null;
      if (darkness) {
        report.darkRooms++;
        for (const list of [lights, withDarkness]) {
          engine.update({ bounds, albedo: null, walls, lights: list, sight: SEES_ALL, sightRadius, ambient: 1 });
          engine.flush();
          const shot = renderView(renderer, engine, target, bounds, scale, x, y);
          if (list === lights) day = shot;
          else darkened = shot;
        }
      }
      // Where the engine places the darkness, and how far its soft rim and a wall's shadow reach into what it covers.
      const source = darkness && placeLight(darkness.x, darkness.y, darkness.flame, allSegments(splitBlocking(walls)), texel);
      const shadow = source ? source.flame + wallRadius(texel) + (TILE_SMOOTH + 2) * texel : 0;
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
          if (day && darkened && !inside && d > 0.01) {
            if (Math.abs(day[o]! - darkened[o]!) + Math.abs(day[o + 1]! - darkened[o + 1]!) + Math.abs(day[o + 2]! - darkened[o + 2]!) > 3) report.darkLeaks++;
          }
          // Every fourth pixel: the path to the source is walked for each.
          if (darkened && darkness && source && inside && sx % 4 === 0 && sy % 4 === 0
            && Math.hypot(p[0] - source.x, p[1] - source.y) < darkness.dim * (1 - 2 * DARKNESS.softEdge)
            && clearPath(p, [source.x, source.y], walls, shadow)) {
            report.darkInside++;
            if (darkened[o]! + darkened[o + 1]! + darkened[o + 2]! > 36) report.darkRevealed++;
          }
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
    expect(report.darkRooms).toBeGreaterThan(TRIALS / 3);
    expect(report.darkInside).toBeGreaterThan(TRIALS * 20);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, darkLeaks: 0, darkRevealed: 0 });
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
    const report = await fuzz({ seed: 11, trials: 20, gap: 0.9 });
    console.info(`negative control: ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(1000);
    expect(report.sightLeaks).toBeGreaterThan(1000);
    expect(report.senseLeaks).toBeGreaterThan(1000);
    expect(report.darkLeaks).toBeGreaterThan(1000);
  });

  it('finds light inside a darkness that every light outranks (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 20, outshine: true });
    console.info(`negative control (outshone darkness): ${JSON.stringify(report)}`);
    expect(report.darkInside).toBeGreaterThan(100);
    expect(report.darkRevealed).toBeGreaterThan(report.darkInside / 4);
  });

  it('finds a footprint past a wall when it is drawn as a whole disc (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 6, wholeFootprints: true });
    console.info(`negative control (whole footprints): ${JSON.stringify(report)}`);
    expect(report.spotLeaks).toBeGreaterThan(1000);
  });
});
