import { perceivedLevel, showsMap } from '../../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../../gameSystems/senses/generic';
import { brightThresholdOf, darkSightLookOf, darkSightTintOf } from '../../../lighting/sceneLightingOptions';
import { linearColor } from '../../../lighting/srgb';
import type { SceneLighting } from '../../../types/lightingTypes';
import type { SenseDefinition, SenseLook } from '../../../types/senseTypes';
import { ambientLevel } from '../../../vision/lightLevels';
import type { SeenSpot } from '../../../vision/perception';
import type { AmbientLight, Sight, SightRegion } from '../../../vision/sight';
import type { PierceShape } from './DarknessMap';

/** What a sight mesh writes into the lighting layer: red, green, blue, alpha (see `compositeShader.ts`). */
export type SightChannels = readonly [number, number, number, number];

/**
 * How bright the map is drawn where a sense perceives it without light, as a share of its own
 * colours: `dim` is the grey of darkvision as it always was, `bright` close to daylight.
 */
export const DARK_SIGHT_LEVELS = { dim: 0.15, bright: 0.7 } as const;

/** A look without colour: the share of the map's colour it keeps, and its tint. */
const GREY_LOOKS: Record<Exclude<SenseLook, 'colour'>, { keep: number; tint: readonly [number, number, number] }> = {
  monochrome: { keep: 0.15, tint: [1, 1, 1] },
  'black-and-white': { keep: 0, tint: [1, 1, 1] },
  // Warm tones on a dark ground; brighter than grey at the same level, since red and orange weigh little.
  heat: { keep: 0, tint: [2.6, 0.8, 0.22] },
};

/** The scene draws every look without colour in the map's own colours (`darkSightLook: 'colour'`). */
const IN_COLOUR = { keep: 1, tint: [1, 1, 1] } as const;
/** The most a tint may raise one channel; the heat look's red reaches 2.6. */
const MAX_TINT_GAIN = 3;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * A tint the scene picked (`#rrggbb`), in linear light and as bright as white: it gives the
 * picture its hue and leaves its brightness, as far as one channel can carry it. A colour
 * without a hue (a grey, black) and no colour at all are no tint.
 */
export function darkSightTint(color: string | null): readonly [number, number, number] {
  if (!color) return [1, 1, 1];
  const [r, g, b] = linearColor(color);
  const luminance = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
  if (luminance <= 0) return [1, 1, 1];
  const gain = Math.min(1 / luminance, MAX_TINT_GAIN / Math.max(r, g, b));
  return [r * gain, g * gain, b * gain];
}

function seesByLight(sense: SenseDefinition): boolean {
  return perceivedLevel(sense, 'bright') !== null || perceivedLevel(sense, 'dim') !== null;
}

/**
 * The channels the region of a sense is drawn into, or null when it draws nothing: a sense
 * that shows no map (`showsMap`: never one that walls do not stop), or one without an area.
 * - Red, seen by light: the token's sight, and a sense that needs no eyes. A sense of the eyes
 *   lies within the sight of its token, which is red already.
 * - Green or blue, perceived without light: green for a look without colour, blue in colour.
 * - Alpha: dim light is perceived as bright.
 */
export function sightChannels({ sense, polygon }: SightRegion): SightChannels | null {
  if (!showsMap(sense) || !polygon) return null;
  const inDarkness = perceivedLevel(sense, 'dark') !== null;
  const channels: SightChannels = [
    sense === NORMAL_SIGHT || (sense.worksWhileBlinded && seesByLight(sense)) ? 1 : 0,
    inDarkness && sense.look !== 'colour' ? 1 : 0,
    inDarkness && sense.look === 'colour' ? 1 : 0,
    sense.sees.dim === 'as-bright' ? 1 : 0,
  ];
  return channels.some((value) => value > 0) ? channels : null;
}

/** What the footprint of a token seen without the map around it is drawn into: seen by light, and in colour without. */
export const SPOT_CHANNELS: SightChannels = [1, 0, 1, 0];

/** How the composite draws what is perceived without light: one look without colour and one in colour per scene. */
export interface DarkLooks {
  /** Share of the map's colour the look without colour keeps. */
  greyKeep: number;
  /** Its tint, scaled by how bright it is drawn. */
  greyTint: readonly [number, number, number];
  /** How bright the look without colour is drawn: the level in `greyTint`. */
  greyLevel: number;
  /** How bright the look in colour is drawn. */
  colourLevel: number;
}

function darkLevel(sense: SenseDefinition): number {
  return sense.sees.dark === 'as-bright' ? DARK_SIGHT_LEVELS.bright : DARK_SIGHT_LEVELS.dim;
}

/**
 * The dark looks of a scene, from the senses its vision tokens have. The green channel holds
 * one look for the whole scene: where senses with different looks without colour meet (a
 * collection that mixes monochrome and heat), the one drawn brighter wins, the first of equals.
 * Without such a sense it is the grey of darkvision, which draws nothing while green is empty.
 * The look in colour is as bright as its brightest sense; `spots` (tokens seen in their
 * footprint) are drawn bright.
 *
 * The scene may override the look without colour (`darkSightLook`: `grey` draws every such
 * sense, black and white and heat too, in the grey of darkvision, `colour` in the map's own
 * colours, each at the level the sense sees the dark at) and tint it (`darkSightTint`). Neither
 * touches the senses that see in colour, nor what any sense perceives.
 */
export function darkLooks(sight: Sight, spots = false, scene: Pick<SceneLighting, 'darkSightLook' | 'darkSightTint'> = {}): DarkLooks {
  let grey: SenseDefinition | null = null;
  let colourLevel: number = spots ? DARK_SIGHT_LEVELS.bright : DARK_SIGHT_LEVELS.dim;
  for (const region of sight.regions) {
    const channels = sightChannels(region);
    if (!channels) continue;
    if (channels[1] && (!grey || darkLevel(region.sense) > darkLevel(grey))) grey = region.sense;
    if (channels[2]) colourLevel = Math.max(colourLevel, darkLevel(region.sense));
  }
  const chosen = darkSightLookOf(scene);
  const own = GREY_LOOKS[grey && grey.look !== 'colour' ? grey.look : 'monochrome'];
  const look = chosen === 'colour' ? IN_COLOUR : chosen === 'grey' ? GREY_LOOKS.monochrome : own;
  const tint = darkSightTint(darkSightTintOf(scene));
  const level = grey ? darkLevel(grey) : DARK_SIGHT_LEVELS.dim;
  return { greyKeep: look.keep, greyTint: [look.tint[0] * tint[0] * level, look.tint[1] * tint[1] * level, look.tint[2] * tint[2] * level], greyLevel: level, colourLevel };
}

/**
 * How much the ambient light is raised where dim light is perceived as bright: to the bright
 * threshold while the scene is dimly lit, not at all while it is dark or bright.
 */
export function ambientLift(scene: AmbientLight): number {
  return ambientLevel(scene) === 'dim' && scene.ambient > 0 ? brightThresholdOf(scene) / scene.ambient : 1;
}

/**
 * What is perceived inside magical darkness: the area of every sense that shows the map and
 * sees there, at the level it sees it (1 as bright light, 0.5 as dim), and the footprint of
 * every token shown where the map is not (a party token standing in the darkness).
 */
export function pierceShapes(sight: Sight, spots: readonly SeenSpot[] = []): PierceShape[] {
  const shapes: PierceShape[] = [];
  for (const region of sight.all ? [] : sight.regions) {
    const level = showsMap(region.sense) ? perceivedLevel(region.sense, 'magical-dark') : null;
    if (level && region.polygon) shapes.push({ origin: region.origin, polygon: region.polygon, level: level === 'bright' ? 1 : 0.5 });
  }
  for (const spot of spots) shapes.push({ origin: spot, polygon: spot.polygon, level: 1 });
  return shapes;
}
