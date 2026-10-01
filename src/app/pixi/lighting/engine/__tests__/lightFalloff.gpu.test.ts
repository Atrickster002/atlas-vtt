import { afterEach, describe, expect, it } from 'vitest';
import { LIGHT_REACH } from '../../../../lighting/lightingConstants';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS } from '../../../../lighting/lightPresets';
import type { UnitScale } from '../../../../lighting/lightingUnits';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { LightEmission } from '../../../../types/lightingTypes';
import { SEES_ALL, computeSight, type Sight } from '../../../../vision/sight';
import { engineLight } from '../../lightSources';
import { LightingEngine } from '../LightingEngine';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';

const SIZE = 512;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/** The floor: mid grey (sRGB #808080) under no ambient light, so all it shows is the light. */
const FLOOR = 0x808080;
/** 5 ft cells of 35 px: a lantern's 60 ft fit a 1024 px map with their fade. */
const SCALE: UnitScale = { unitDistance: 5, cellSize: 35 };
/** The share of the bright level the dim range never falls below. */
const DIM_FLOOR = 0.25;

/**
 * What the players see of one light on an open floor, by distance from its flame: the displayed
 * luminance (the composite's sRGB pixel in linear light, Rec. 709 weights), after exposure and
 * tonemap, averaged over the four axis directions.
 */
interface Profile {
  bright: number;
  dim: number;
  reach: number;
  /** World pixels between two samples. */
  step: number;
  at(distance: number): number;
}

function custom(bright: number, dim: number): LightEmission {
  return { bright, dim, color: '#ffffff', intensity: 1, animation: 'none' };
}

/** The level of the bright range: the displayed luminance halfway to the bright radius. */
function brightLevel(profile: Profile): number {
  return profile.at(profile.bright / 2);
}

/** Distances from the bright radius to one light-map texel inside the dim radius, the dim range as drawn. */
function dimRange(profile: Profile): number[] {
  const end = profile.dim - 2;
  const distances: number[] = [];
  for (let d = Math.min(profile.bright, end); d < end; d += profile.step) distances.push(d);
  return [...distances, end];
}

/** The dimmest point of the dim range, as a share of `level`. */
function dimFloor(profile: Profile, level = brightLevel(profile)): number {
  return Math.min(...dimRange(profile).map((d) => profile.at(d))) / level;
}

describe('light falloff as the players see it', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function profileOf(emission: LightEmission, map = 1024, sight: Sight = SEES_ALL): Promise<Profile> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    // Steady: the picture of the light's own settings, without a flicker sample.
    const light = { ...engineLight({ key: 'l', x: map / 2, y: map / 2, emission }, SCALE), animation: 'none' as const };
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds: { width: map, height: map }, albedo: null, walls: [], lights: [light], sight, sightRadius: 20, ambient: 0 });
    engine.flush();
    const pixel = renderThroughEngine(engine, renderer, { size: SIZE, scale: SIZE / map, x: 0, y: 0, tint: FLOOR, map });
    const luminance = (x: number, y: number): number => pixel(x, y).reduce((sum, channel, i) => sum + srgbToLinear(channel / 255) * LUMA[i]!, 0);
    const centre = SIZE / 2;
    const step = map / SIZE;
    /** Sample i lies i + ½ pixels along an axis and ½ pixel beside it. */
    const samples = Array.from({ length: centre }, (_, i) => (
      luminance(centre + i, centre) + luminance(centre - 1 - i, centre) + luminance(centre, centre + i) + luminance(centre, centre - 1 - i)
    ) / 4);
    const distanceOf = (i: number): number => step * Math.hypot(i + 0.5, 0.5);
    const at = (distance: number): number => {
      const i = Math.min(samples.length - 2, Math.max(0, Math.floor(distance / step - 0.5)));
      const t = Math.min(1, Math.max(0, (distance - distanceOf(i)) / (distanceOf(i + 1) - distanceOf(i))));
      return samples[i]! + (samples[i + 1]! - samples[i]!) * t;
    };
    return { bright: light.bright, dim: light.dim, reach: light.dim * LIGHT_REACH, step, at };
  }

  it.each(LIGHT_PRESET_IDS)('lights the dim range of a %s out to its edge: never under a quarter of the bright level', async (id) => {
    const profile = await profileOf(LIGHT_PRESETS[id].emission);
    const floor = dimFloor(profile);
    console.info(`${id}: dim range floor ${(floor * 100).toFixed(1)}% of the bright level`);
    expect(floor).toBeGreaterThanOrEqual(DIM_FLOOR);
  });

  it.each([
    ['all bright (bright = dim)', custom(30, 30), 1024],
    ['small (2 ft / 4 ft)', custom(2, 4), 1024],
    ['large (120 ft / 240 ft)', custom(120, 240), 4096],
  ] as const)('lights the dim range of a custom light out to its edge: %s', async (name, emission, map) => {
    const profile = await profileOf(emission, map);
    const floor = dimFloor(profile);
    console.info(`${name}: dim range floor ${(floor * 100).toFixed(1)}% of the bright level`);
    expect(floor).toBeGreaterThanOrEqual(DIM_FLOOR);
  });

  it('lights a light without a bright range as dim light: a quarter of what a bright range of its kind shows', async () => {
    const level = brightLevel(await profileOf(custom(20, 40)));
    const floor = dimFloor(await profileOf(custom(0, 40)), level);
    console.info(`dim only (bright = 0): dim range floor ${(floor * 100).toFixed(1)}% of the bright level`);
    expect(floor).toBeGreaterThanOrEqual(DIM_FLOOR);
  });

  it('is brightest at the flame and dimmer in the dim range than in the bright range', async () => {
    const profile = await profileOf(LIGHT_PRESETS.torch.emission);
    const level = brightLevel(profile);
    expect(profile.at(profile.step)).toBeGreaterThan(level);
    expect(profile.at((profile.bright + profile.dim) / 2)).toBeLessThan(0.75 * level);
    expect(profile.at(profile.dim - 2)).toBeLessThan(0.6 * level);
  });

  it('fades out past the dim radius and shows nothing from the reach on', async () => {
    const profile = await profileOf(LIGHT_PRESETS.torch.emission);
    const level = brightLevel(profile);
    const edge = profile.at(profile.dim - 2);
    const halfway = profile.at((profile.dim + profile.reach) / 2);
    expect(halfway).toBeLessThan(0.75 * edge);
    expect(halfway).toBeGreaterThan(0.1 * edge);
    // Past the reach only bounced light is left: under a fiftieth of the bright level.
    for (const d of [profile.reach + 2, profile.reach + 20, profile.reach + 60]) expect(profile.at(d)).toBeLessThan(0.02 * level);
  });

  it('keeps the dim range brighter than the grey of darkvision beside it', async () => {
    // A token at the flame that sees 500 px, all of it with darkvision.
    const sight = computeSight([{ tokenId: 't', origin: { x: 512, y: 512 }, range: 500, darkvision: 500 }], []);
    const profile = await profileOf(LIGHT_PRESETS.torch.emission, 1024, sight);
    const grey = profile.at(profile.reach + 40);
    expect(grey).toBeGreaterThan(0);
    expect(profile.at(profile.dim - 2)).toBeGreaterThan(1.3 * grey);
  });

  it.each(LIGHT_PRESET_IDS)('shows no ring around a %s: light only falls with distance, and nowhere steeply', async (id) => {
    const profile = await profileOf(LIGHT_PRESETS[id].emission);
    const level = brightLevel(profile);
    let steepest = 0;
    for (let d = profile.bright / 2; d < profile.reach + 20; d += profile.step) {
      const drop = profile.at(d) - profile.at(d + profile.step);
      // 8-bit channels and dither: a level may round up by one step.
      expect(drop).toBeGreaterThan(-0.01 * level);
      steepest = Math.max(steepest, drop / profile.step);
    }
    // The steepest fall, as a share of the bright level per hundredth of the dim radius.
    const perHundredth = (steepest * profile.dim) / 100 / level;
    console.info(`${id}: steepest fall ${(perHundredth * 100).toFixed(1)}% of the bright level per 1% of the dim radius`);
    expect(perHundredth).toBeLessThan(0.06);
  });
});
