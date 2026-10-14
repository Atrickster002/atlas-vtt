import { parseAsset, type AssetRef } from './asset.ts';
import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** What a sheet holds at most: as many resources as a token shows. */
export const MAX_SHEET_RESOURCES = 6;
/** The longest key a sheet names a resource by. */
export const MAX_RESOURCE_KEY = 64;

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
const DIRECTIONS: readonly unknown[] = ['drains', 'fills', 'static'];
const CONTROL = /\p{Cc}/u;

/** A resource of the player's own character, by name: what its bar shows, as a number too. */
export interface SheetResource {
  /** What the GM's Atlas knows the resource by, which a player's edit names; null from a GM that names none. */
  readonly key: string | null;
  readonly name: string;
  readonly colour: string;
  readonly direction: 'drains' | 'fills' | 'static';
  readonly current: number;
  readonly max: number;
  /** Whether the player may change `current` (`book-resource`): never without a key, never for a fixed value; false from a GM that does not say. */
  readonly editable: boolean;
}

/** The character a player plays: the token the GM linked to them, as little as a sheet needs. */
export interface BookCharacter {
  readonly name: string;
  /** The token's artwork, asked for by hash like the map. */
  readonly art: AssetRef | null;
  /** The colour of the token's ring; null for artwork shown unframed. */
  readonly ring: string | null;
  readonly resources: readonly SheetResource[];
}

/** A player sets the current value of one of their character's resources; the GM's Atlas clamps it to the resource's range. */
export interface BookResourceMessage {
  readonly t: 'book-resource';
  readonly key: string;
  readonly current: number;
}

const isValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

/** A key a resource may be named by: a string of 1 to `MAX_RESOURCE_KEY` characters, none of them a control character. */
export const isResourceKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_RESOURCE_KEY && !CONTROL.test(value);

/** A static value may be 0 (an armour class); a counting one needs a maximum above 0. */
const holdsValue = (direction: unknown, max: number): boolean => (direction === 'static' ? max >= 0 : max > 0);

/** A resource as the page reads it. A sheet of an older GM names no key and says nothing of edits: it reads as one the player cannot change. */
function parseResource(value: unknown): SheetResource | null {
  if (!isRecord(value) || typeof value.colour !== 'string' || !HEX_COLOUR.test(value.colour) || !DIRECTIONS.includes(value.direction)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  if (name === null || !isValue(value.current) || !isValue(value.max) || !holdsValue(value.direction, value.max)) return null;
  const key = value.key === undefined || value.key === null ? null : isResourceKey(value.key) ? value.key : undefined;
  const editable = value.editable === undefined ? false : typeof value.editable === 'boolean' ? value.editable : undefined;
  if (key === undefined || editable === undefined) return null;
  const direction = value.direction as SheetResource['direction'];
  return { key, name, colour: value.colour, direction, current: value.current, max: value.max, editable: editable && key !== null && direction !== 'static' };
}

function parseResources(value: unknown): SheetResource[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHEET_RESOURCES) return null;
  const resources = value.map(parseResource);
  return resources.every((resource) => resource !== null) ? resources : null;
}

/** A character, null for none, or undefined when it is malformed. */
export function parseBookCharacter(value: unknown): BookCharacter | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const name = bookLine(value.name, MAX_BOOK_TITLE, true);
  const art = value.art === null ? null : parseAsset(value.art);
  const resources = parseResources(value.resources);
  const ringOk = value.ring === null || (typeof value.ring === 'string' && HEX_COLOUR.test(value.ring));
  if (name === null || resources === null || !ringOk || (art === null && value.art !== null)) return undefined;
  return { name, art, ring: value.ring as string | null, resources };
}

/** A player's edit of a resource as the GM reads it, or null when it is malformed. */
export function parseBookResourceMessage(value: Record<string, unknown>): BookResourceMessage | null {
  return isResourceKey(value.key) && isValue(value.current) ? { t: 'book-resource', key: value.key, current: value.current } : null;
}
