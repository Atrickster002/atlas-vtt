import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { DEFAULT_BOOK_SLOTS, parseBookSlots, parseEquipped, parseSlotMessage, settledEquipped, type BookSlots, type Equipped, type SlotMessage } from './bookSlots.ts';
import { bookLine, bookText } from './bookText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** What a player's book holds at most. */
export const MAX_BOOK_ITEMS = 200;
export const MAX_BOOK_NOTES = 60;
export const MAX_BOOK_PINS = 120;
export const MAX_PURSE_ROWS = 6;
export const MAX_SHEET_RESOURCES = 6;
/** The longest texts of a book, in characters. A note's body is as long as one player frame carries. */
export const MAX_BOOK_TITLE = 80;
export const MAX_NOTE_BODY = 2000;
export const MAX_PIN_BODY = 600;
export const MAX_ITEM_TEXT = 4000;
export const MAX_ITEM_PROPERTIES = 16;
export const MAX_ITEM_VALUE = 200;
export const MAX_COIN_NAME = 24;
/** An item's, note's or pin's id: 96 random bits in hex, made by whoever made the thing. */
export const BOOK_ID_PATTERN = /^[0-9a-f]{24}$/;
/** What a pin on the world map marks. */
export const PIN_KINDS = ['note', 'treasure', 'danger', 'place', 'person'] as const;
export type PinKind = (typeof PIN_KINDS)[number];
/** The ladder an item's rarity is coloured by; null for a rarity outside it. */
export const ITEM_TONES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type ItemTone = (typeof ITEM_TONES)[number];

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
const DIRECTIONS: readonly unknown[] = ['drains', 'fills', 'static'];

/** A resource of the player's own character, by name: what its bar shows, as a number too. */
export interface SheetResource {
  readonly name: string;
  readonly colour: string;
  readonly direction: 'drains' | 'fills' | 'static';
  readonly current: number;
  readonly max: number;
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

/** An item the GM handed to the character, as text only. `at` is the GM's clock when it was given. */
export interface BookItem {
  readonly id: string;
  readonly name: string;
  readonly type: string | null;
  readonly rarity: string | null;
  readonly tone: ItemTone | null;
  readonly price: string | null;
  readonly description: string | null;
  readonly properties: readonly { readonly label: string; readonly value: string }[];
  readonly at: number;
}

/** A note as its player writes it; shown as text only. */
export interface BookNoteDraft {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** A note as the GM keeps it: `at` is the GM's clock when it was last written. */
export interface BookNote extends BookNoteDraft {
  readonly at: number;
}

/** A player's own pin on the world map: `x` and `y` are shares of the image's width and height. */
export interface BookPin {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: PinKind;
  readonly title: string;
  readonly body: string;
}

/** One kind of coin and how many of it the character carries. */
export interface PurseRow {
  readonly name: string;
  readonly amount: number;
}

/** The campaign's world map: an image by hash and its own size in pixels. It never names its file. */
export interface BookWorldMap {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** Everything one player's pages besides the table show. Without a character only the world map is there. */
export interface PlayerBook {
  readonly character: BookCharacter | null;
  readonly worldMap: BookWorldMap | null;
  readonly items: readonly BookItem[];
  readonly notes: readonly BookNote[];
  readonly pins: readonly BookPin[];
  readonly purse: readonly PurseRow[];
  /** The player's slots, and which item lies in which; a GM that knows no slots sends neither (the defaults, nothing equipped). */
  readonly slots: BookSlots;
  readonly equipped: readonly Equipped[];
}

/** Sent to one player: their book whole, the character alone once only it changed, or an item just handed over. */
export type BookMessage =
  | { readonly t: 'book'; readonly book: PlayerBook }
  | { readonly t: 'book-sheet'; readonly character: BookCharacter | null }
  | { readonly t: 'book-item'; readonly item: BookItem };

/** What a player writes into their own book. The GM keeps it and answers a refused one with the whole book. */
export type PlayerBookMessage =
  | { readonly t: 'book-note'; readonly note: BookNoteDraft }
  | { readonly t: 'book-note-delete'; readonly id: string }
  | { readonly t: 'book-pin'; readonly pin: BookPin }
  | { readonly t: 'book-pin-delete'; readonly id: string }
  | { readonly t: 'book-purse'; readonly purse: readonly PurseRow[] }
  | SlotMessage;

const GM_TYPES: readonly unknown[] = ['book', 'book-sheet', 'book-item'];
const PLAYER_TYPES: readonly unknown[] = ['book-note', 'book-note-delete', 'book-pin', 'book-pin-delete', 'book-purse', 'book-equip', 'book-slots'];

export const isBookType = (t: unknown): t is BookMessage['t'] => GM_TYPES.includes(t);
export const isPlayerBookType = (t: unknown): t is PlayerBookMessage['t'] => PLAYER_TYPES.includes(t);

const isId = (value: unknown): value is string => typeof value === 'string' && BOOK_ID_PATTERN.test(value);
const isValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isShare = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

function parseList<T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed: T[] = [];
  for (const entry of value) {
    const item = parse(entry);
    if (item === null) return null;
    parsed.push(item);
  }
  return parsed;
}

/** Entries with ids, each id once. */
function distinct<T extends { readonly id: string }>(entries: T[] | null): T[] | null {
  return entries !== null && new Set(entries.map((entry) => entry.id)).size === entries.length ? entries : null;
}

function parseResource(value: unknown): SheetResource | null {
  if (!isRecord(value) || typeof value.colour !== 'string' || !HEX_COLOUR.test(value.colour) || !DIRECTIONS.includes(value.direction)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  if (name === null || !isValue(value.current) || !isValue(value.max) || !(value.max > 0)) return null;
  return { name, colour: value.colour, direction: value.direction as SheetResource['direction'], current: value.current, max: value.max };
}

/** A character, null for none, or undefined when it is malformed. */
export function parseBookCharacter(value: unknown): BookCharacter | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const name = bookLine(value.name, MAX_BOOK_TITLE, true);
  const art = value.art === null ? null : parseAsset(value.art);
  const resources = parseList(value.resources, MAX_SHEET_RESOURCES, parseResource);
  const ringOk = value.ring === null || (typeof value.ring === 'string' && HEX_COLOUR.test(value.ring));
  if (name === null || resources === null || !ringOk || (art === null && value.art !== null)) return undefined;
  return { name, art, ring: value.ring as string | null, resources };
}

/** A line that may be missing: null when it is, undefined when it is malformed. */
function optionalLine(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  return bookLine(value, max) ?? undefined;
}

function parseProperty(value: unknown): { label: string; value: string } | null {
  if (!isRecord(value)) return null;
  const label = bookLine(value.label, MAX_BOOK_TITLE);
  const text = bookLine(value.value, MAX_ITEM_VALUE);
  return label === null || text === null ? null : { label, value: text };
}

export function parseBookItem(value: unknown): BookItem | null {
  if (!isRecord(value) || !isId(value.id) || !isTime(value.at)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const type = optionalLine(value.type, MAX_BOOK_TITLE);
  const rarity = optionalLine(value.rarity, MAX_BOOK_TITLE);
  const price = optionalLine(value.price, MAX_BOOK_TITLE);
  const description = value.description === null ? null : bookText(value.description, MAX_ITEM_TEXT);
  const properties = parseList(value.properties, MAX_ITEM_PROPERTIES, parseProperty);
  const tone = value.tone === null || (ITEM_TONES as readonly unknown[]).includes(value.tone) ? (value.tone as ItemTone | null) : undefined;
  if (name === null || type === undefined || rarity === undefined || price === undefined || tone === undefined || properties === null) return null;
  if (description === null && value.description !== null) return null;
  return { id: value.id, name, type, rarity, tone, price, description, properties, at: value.at };
}

/** A note as its player sent it, cleaned; a title may be empty. */
export function parseBookNoteDraft(value: unknown): BookNoteDraft | null {
  if (!isRecord(value) || !isId(value.id)) return null;
  const title = bookLine(value.title, MAX_BOOK_TITLE, true);
  const body = bookText(value.body, MAX_NOTE_BODY);
  return title === null || body === null ? null : { id: value.id, title, body };
}

function parseBookNote(value: unknown): BookNote | null {
  const draft = parseBookNoteDraft(value);
  return draft === null || !isRecord(value) || !isTime(value.at) ? null : { ...draft, at: value.at };
}

export function parseBookPin(value: unknown): BookPin | null {
  if (!isRecord(value) || !isId(value.id) || !isShare(value.x) || !isShare(value.y) || !(PIN_KINDS as readonly unknown[]).includes(value.kind)) return null;
  const title = bookLine(value.title, MAX_BOOK_TITLE, true);
  const body = bookText(value.body, MAX_PIN_BODY);
  return title === null || body === null ? null : { id: value.id, x: value.x, y: value.y, kind: value.kind as PinKind, title, body };
}

function parsePurseRow(value: unknown): PurseRow | null {
  if (!isRecord(value) || typeof value.amount !== 'number' || !Number.isInteger(value.amount) || value.amount < 0 || value.amount > MAX_TOKEN_VALUE) return null;
  const name = bookLine(value.name, MAX_COIN_NAME);
  return name === null ? null : { name, amount: value.amount };
}

export function parsePurse(value: unknown): PurseRow[] | null {
  return parseList(value, MAX_PURSE_ROWS, parsePurseRow);
}

function parseWorldMap(value: unknown): BookWorldMap | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isSide(value.width) || !isSide(value.height)) return undefined;
  const image = parseAsset(value.image);
  return image === null ? undefined : { image, width: value.width, height: value.height };
}

export function parsePlayerBook(value: unknown): PlayerBook | null {
  if (!isRecord(value)) return null;
  const character = parseBookCharacter(value.character);
  const worldMap = parseWorldMap(value.worldMap);
  const items = distinct(parseList(value.items, MAX_BOOK_ITEMS, parseBookItem));
  const notes = distinct(parseList(value.notes, MAX_BOOK_NOTES, parseBookNote));
  const pins = distinct(parseList(value.pins, MAX_BOOK_PINS, parseBookPin));
  const purse = parsePurse(value.purse);
  const slots = value.slots === undefined ? DEFAULT_BOOK_SLOTS : parseBookSlots(value.slots);
  const equipped = value.equipped === undefined ? [] : parseEquipped(value.equipped);
  if (character === undefined || worldMap === undefined || items === null || notes === null || pins === null || purse === null || slots === null || equipped === null) return null;
  return { character, worldMap, items, notes, pins, purse, slots, equipped: settledEquipped(equipped, slots, items) };
}

/** A book message as the page reads it, or null for anything malformed. */
export function parseBookMessage(value: Record<string, unknown>): BookMessage | null {
  if (value.t === 'book') {
    const book = parsePlayerBook(value.book);
    return book === null ? null : { t: 'book', book };
  }
  if (value.t === 'book-sheet') {
    const character = parseBookCharacter(value.character);
    return character === undefined ? null : { t: 'book-sheet', character };
  }
  const item = value.t === 'book-item' ? parseBookItem(value.item) : null;
  return item === null ? null : { t: 'book-item', item };
}

/** What a player wrote into their book as the GM reads it, cleaned; null for anything malformed. */
export function parsePlayerBookMessage(value: Record<string, unknown>): PlayerBookMessage | null {
  switch (value.t) {
    case 'book-note': {
      const note = parseBookNoteDraft(value.note);
      return note === null ? null : { t: 'book-note', note };
    }
    case 'book-pin': {
      const pin = parseBookPin(value.pin);
      return pin === null ? null : { t: 'book-pin', pin };
    }
    case 'book-note-delete':
    case 'book-pin-delete':
      return isId(value.id) ? { t: value.t, id: value.id } : null;
    case 'book-purse': {
      const purse = parsePurse(value.purse);
      return purse === null ? null : { t: 'book-purse', purse };
    }
    case 'book-equip':
    case 'book-slots':
      return parseSlotMessage(value);
    default:
      return null;
  }
}
