import { isFiniteNumber, isRecord } from '../../services/assetMetadataGuards';
import { UVTT_LIMITS, type UvttPoint } from './uvttTypes';

/**
 * Readers for single fields of a Universal VTT file. A field that is missing where it is
 * needed, of the wrong type or out of range ends the reading with `UvttFormatError`, whose
 * message is a sentence naming the field in plain words; `parseUvtt` turns it into its result.
 */
export class UvttFormatError extends Error {}

export function refuse(problem: string): never {
  throw new UvttFormatError(problem);
}

/** A field a file may leave out or set to null. */
export function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

export function readRecord(value: unknown, what: string): Record<string, unknown> {
  return isRecord(value) ? value : refuse(`${what} is missing or not an object.`);
}

/** An optional list: absent reads as empty, and it may hold at most `limit` entries. */
export function readList(value: unknown, what: string, limit: number, limitProblem: string): unknown[] {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value)) return refuse(`${what} is not a list.`);
  return value.length > limit ? refuse(limitProblem) : value;
}

export function readNumber(value: unknown, what: string, min: number, max: number): number {
  if (!isFiniteNumber(value)) return refuse(`${what} is missing or not a number.`);
  return value < min || value > max ? refuse(`${what} is out of range.`) : value;
}

export function readOptionalNumber(value: unknown, what: string, min: number, max: number, fallback: number): number {
  return isAbsent(value) ? fallback : readNumber(value, what, min, max);
}

export function readOptionalBoolean(value: unknown, what: string, fallback: boolean): boolean {
  if (isAbsent(value)) return fallback;
  return typeof value === 'boolean' ? value : refuse(`${what} is neither true nor false.`);
}

/** A position in cells, within `UVTT_LIMITS.distance` of zero on both axes. */
export function readPoint(value: unknown, what: string): UvttPoint {
  if (!isRecord(value)) return refuse(`${what} is missing or not a position.`);
  const { distance } = UVTT_LIMITS;
  return {
    x: readNumber(value.x, `${what} (x)`, -distance, distance),
    y: readNumber(value.y, `${what} (y)`, -distance, distance),
  };
}

const COLOR = /^#?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i;

/** A colour written as `aarrggbb` or `rrggbb`, as `#rrggbb`; the alpha is dropped. */
export function readColor(value: unknown, what: string): string {
  const match = typeof value === 'string' ? COLOR.exec(value.trim()) : null;
  return match?.[1] ? `#${match[1].toLowerCase()}` : refuse(`${what} is not a colour.`);
}
