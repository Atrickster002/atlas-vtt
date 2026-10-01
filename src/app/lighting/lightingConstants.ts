import type { MapBounds } from '../vision/visibility';

/** Distances in the wall field are clamped here; sphere tracing never needs a longer step. */
export const FIELD_MAX = 128;
/** World pixels per texel of the world-space lighting textures on ordinary maps. */
export const BASE_TEXEL = 2;
/** Longest side of a world-space texture; larger maps get coarser texels. */
export const MAX_TEXELS = 4096;
/**
 * Farthest a light may reach, in world pixels: the side of the largest map lit at full
 * resolution. A light's tile is cut to the map, so the engine never traces more than this.
 */
export const MAX_LIGHT_REACH = MAX_TEXELS * BASE_TEXEL;
/** Rays traced across a light's flame per tile texel in its penumbra. */
export const TILE_RAYS = 32;
/**
 * Largest radius, in texels, over which a traced tile is smoothed: it melts the steps between
 * ray counts into a ramp. Each texel smooths only within its wall clearance, so less near walls.
 */
export const TILE_SMOOTH = 4;
/** A light fades out from its dim radius to this multiple of it, where it ends. */
export const LIGHT_REACH = 1.12;
/**
 * How much light a light gives in its two ranges (HDR, before exposure): `bright` up to the
 * bright radius, `dim` from there to the dim radius, with a soft knee between them. Dim light
 * is 40% of bright light, which a mid-grey floor shows at a quarter to a third of the bright
 * range's luminance (the tonemap darkens low light more than in proportion): the least that
 * `lightFalloff.gpu.test.ts` accepts at the edge of the dim range.
 */
export const LIGHT_LEVELS = { bright: 1.25, dim: 0.5 } as const;
export const EXPOSURE = 0.9;
/** Light colours are mixed this far towards white, so tinted light keeps the map readable. */
export const TINT_TO_WHITE = 0.5;
/** Smallest flame, as a share of the dim radius, so shadow edges never look cut out. */
export const MIN_SOFTNESS = 0.12;
/** Strength of the cool grey shift where the light is low and none of it a light's own (ambient, bounce). */
export const PURKINJE = 0.55;

export const BOUNCE = {
  probe: 16,
  interval: 16,
  cascades: 4,
  emitTexel: 4,
  spread: 250,
  floorGain: 0.001,
  wallGain: 0.6,
  gain: 1,
  /** While lights move, bounce is rebuilt at most this often. */
  throttleMs: 100,
} as const;

/**
 * Animated lights are redrawn at most this often, about 30 times a second: flicker walks step
 * every 45–120 ms and are interpolated in between. A little under two 60 Hz frames, so a frame
 * that comes early never waits for the next one.
 */
export const FLICKER_INTERVAL_MS = 30;

/**
 * A soft glow around each flame, drawn with the light so it stays inside its walls; an
 * image-space bloom would blur light across walls. `gain` is its peak on top of the falloff
 * (HDR), `size` its Gaussian sigma as a share of the bright radius.
 */
export const HALO = { gain: 0.8, size: 0.25 } as const;

/** World pixels per texel for a map: 2 px, coarser on maps longer than 8,192 px. */
export function worldTexel(bounds: MapBounds): number {
  return Math.max(BASE_TEXEL, Math.max(bounds.width, bounds.height) / MAX_TEXELS);
}

/**
 * Walls are capsules this wide around their centre line: at least a texel's diagonal, so a
 * bilinear sample of a world texture never carries light past the centre line.
 */
export function wallRadius(texel: number): number {
  return Math.max(3, texel * Math.SQRT2 + 0.01);
}

/** Bilinear interpolation of a 1-Lipschitz field overestimates it by less than this. */
export function fieldMargin(texel: number): number {
  return texel * 0.75;
}

/**
 * Within this distance of a wall's centre line a pixel keeps its own light: closer in, the wall
 * field's gradient may point across the line.
 */
export function wallCore(texel: number): number {
  return 1.5 * texel;
}

/**
 * Distance from a wall's centre line at which the light map is fully lit again: past the capsule
 * (tiles are lit wherever the trace clears it) and the light map's bilinear texel.
 */
export function wallBand(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + texel;
}

/**
 * How far from its centre line a wall still changes a tile: smoothing reads a texel's clearance
 * up to `TILE_SMOOTH` texels, plus a texel for the bilinear field.
 */
export function tileWallReach(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + (TILE_SMOOTH + 1) * texel;
}

/**
 * Wall ends closer than this to another wall are joined by a bridge, for light and sight
 * alike: wider than any gap the field closes by itself (two capsules with their bilinear
 * margin, plus the tile's contact fade), so light and sight always agree on what is closed.
 */
export function sealTolerance(texel: number): number {
  return 2 * (wallRadius(texel) + fieldMargin(texel)) + 2 * texel;
}
