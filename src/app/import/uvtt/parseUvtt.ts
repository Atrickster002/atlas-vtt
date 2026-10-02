import {
  UvttFormatError, isAbsent, readColor, readList, readNumber, readOptionalBoolean, readOptionalNumber, readPoint, readRecord, refuse,
} from './uvttFields';
import { readImage } from './uvttImage';
import { UVTT_LIMITS, type UvttLight, type UvttMap, type UvttParseResult, type UvttPoint, type UvttPortal } from './uvttTypes';

const count = (value: number): string => value.toLocaleString('en-US');
const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const UVTT_TOO_LARGE = `The file is larger than ${UVTT_LIMITS.fileBytes / 1024 / 1024} MB.`;
const TOO_MANY_WALLS = `The file has more than ${count(UVTT_LIMITS.wallSegments)} wall segments.`;
const TOO_MANY_LIGHTS = `The file has more than ${count(UVTT_LIMITS.lights)} lights.`;

function readPolylines(value: unknown, what: string): UvttPoint[][] {
  return readList(value, `The list of ${what}s`, UVTT_LIMITS.wallSegments, TOO_MANY_WALLS).map((line, index) => {
    const label = `${what} ${index + 1}`;
    if (!Array.isArray(line)) return refuse(`${capitalized(label)} is not a list of positions.`);
    if (line.length > UVTT_LIMITS.wallSegments + 1) return refuse(TOO_MANY_WALLS);
    return line.map((point, pointIndex) => readPoint(point, `Point ${pointIndex + 1} of ${label}`));
  });
}

function readPortal(value: unknown, index: number): UvttPortal {
  const what = `door ${index + 1}`;
  const portal = readRecord(value, capitalized(what));
  const { bounds } = portal;
  if (!Array.isArray(bounds) || bounds.length !== 2) return refuse(`${capitalized(what)} does not have two ends.`);
  // Read for their types only: a door is placed by its two ends
  if (!isAbsent(portal.position)) readPoint(portal.position, `The position of ${what}`);
  readOptionalNumber(portal.rotation, `The rotation of ${what}`, -UVTT_LIMITS.distance, UVTT_LIMITS.distance, 0);
  readOptionalBoolean(portal.freestanding, `"freestanding" of ${what}`, false);
  return {
    bounds: [readPoint(bounds[0], `The first end of ${what}`), readPoint(bounds[1], `The second end of ${what}`)],
    closed: readOptionalBoolean(portal.closed, `"closed" of ${what}`, true),
  };
}

function readLight(value: unknown, index: number): UvttLight {
  const what = `light ${index + 1}`;
  const light = readRecord(value, capitalized(what));
  readOptionalBoolean(light.shadows, `"shadows" of ${what}`, true);
  return {
    position: readPoint(light.position, `The position of ${what}`),
    range: readNumber(light.range, `The range of ${what}`, 0, UVTT_LIMITS.distance),
    intensity: readOptionalNumber(light.intensity, `The intensity of ${what}`, 0, UVTT_LIMITS.distance, 1),
    color: isAbsent(light.color) ? '#ffffff' : readColor(light.color, `The colour of ${what}`),
  };
}

function segmentsOf(polylines: readonly UvttPoint[][]): number {
  return polylines.reduce((total, line) => total + Math.max(0, line.length - 1), 0);
}

function readMap(root: unknown): UvttMap {
  const file = readRecord(root, 'The file\'s content');
  if (!isAbsent(file.format)) readNumber(file.format, 'The format version', 0, UVTT_LIMITS.distance);

  const resolution = readRecord(file.resolution, 'The map\'s resolution');
  const sizeIn = readRecord(resolution.map_size, 'The map size');
  const size = {
    x: readNumber(sizeIn.x, 'The map\'s width', Number.MIN_VALUE, UVTT_LIMITS.mapCells),
    y: readNumber(sizeIn.y, 'The map\'s height', Number.MIN_VALUE, UVTT_LIMITS.mapCells),
  };
  const origin = isAbsent(resolution.map_origin) ? { x: 0, y: 0 } : readPoint(resolution.map_origin, 'The map\'s origin');
  const pixelsPerCell = readNumber(resolution.pixels_per_grid, 'The number of pixels per grid cell', 1, UVTT_LIMITS.pixelsPerCell);

  const polylines = [...readPolylines(file.line_of_sight, 'wall line'), ...readPolylines(file.objects_line_of_sight, 'object outline')];
  const portals = readList(file.portals, 'The list of doors', UVTT_LIMITS.wallSegments, TOO_MANY_WALLS).map(readPortal);
  if (segmentsOf(polylines) + portals.length > UVTT_LIMITS.wallSegments) refuse(TOO_MANY_WALLS);
  const lights = readList(file.lights, 'The list of lights', UVTT_LIMITS.lights, TOO_MANY_LIGHTS).map(readLight);

  const environment = isAbsent(file.environment) ? {} : readRecord(file.environment, 'The environment');
  const ambientLight = isAbsent(environment.ambient_light) ? null : readColor(environment.ambient_light, 'The ambient light');
  const bakedLighting = readOptionalBoolean(environment.baked_lighting, '"baked_lighting"', false);

  // Last: decoding the image is the costly part, and a refused file needs none of it
  return { origin, size, pixelsPerCell, image: readImage(file.image), polylines, portals, lights, ambientLight, bakedLighting };
}

/**
 * Reads the text of a Universal VTT file. Every field is checked for its type and range, and
 * the counts against `UVTT_LIMITS`; a file that fails any check is refused as a whole. Never throws.
 */
export function parseUvtt(text: string): UvttParseResult {
  if (text.length > UVTT_LIMITS.fileBytes) return { ok: false, problem: UVTT_TOO_LARGE };
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'The file is not a Universal VTT map (it is not valid JSON).' };
  }
  try {
    return { ok: true, map: readMap(root) };
  } catch (error) {
    if (error instanceof UvttFormatError) return { ok: false, problem: error.message };
    console.error('[Atlas] Reading a Universal VTT file failed', error);
    return { ok: false, problem: 'The file could not be read.' };
  }
}
