import { isRecord } from '../services/assetMetadataGuards';
import type { LightEmission, LightSource } from '../types/lightingTypes';
import type { WallSegment } from '../types/wallTypes';

/**
 * The lights and walls of a map file as the store holds them. A map file arrives unchecked (a
 * hand edit, a sync conflict, another program), and the fields below are read as typed
 * everywhere else: a rotation that is text gave a beam no direction, and a darkness of
 * `"false"` was a darkness. A field of the wrong type is dropped, which reads as unset; an
 * entry that is no object is left out. Zones have their own reader (`lightZonesFromFile`).
 */
export function lightsFromFile(value: unknown): Record<string, LightSource> {
  return entriesFromFile<LightSource>(value, (light) => {
    const { rotation, emission, ...rest } = light as LightSource & Record<string, unknown>;
    return { ...rest, ...(isFinite(rotation) && { rotation }), emission: emissionFromFile(emission) };
  });
}

/** A light's emission from a map file, a placed light's or one a token carries: its priority a number, its darkness `true`, or neither. */
export function emissionFromFile<Emission>(value: Emission): Emission {
  if (!isRecord(value)) return value;
  const { priority, darkness, ...rest } = value as unknown as LightEmission & Record<string, unknown>;
  return { ...rest, ...(isFinite(priority) && { priority }), ...(darkness === true && { darkness }) } as Emission;
}

/** The walls of a map file: a door is locked only where the file says `true`. */
export function wallsFromFile(value: unknown): Record<string, WallSegment> {
  return entriesFromFile<WallSegment>(value, (wall) => {
    const { locked, ...rest } = wall as WallSegment & Record<string, unknown>;
    return { ...rest, ...(locked === true && { locked }) };
  });
}

function entriesFromFile<Entry>(value: unknown, read: (entry: Record<string, unknown>) => Entry): Record<string, Entry> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, entry]) => (isRecord(entry) ? [[id, read(entry)]] : [])));
}

function isFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
