import {
  isRecord, MAX_BOOK_ITEMS, MAX_BOOK_NOTES, MAX_BOOK_PINS, parseBookItem, parseBookNoteDraft, parseBookPin, parsePurse,
  type BookItem, type BookNote, type BookPin, type PlayerBookMessage, type PurseRow,
} from '../../protocol/index.ts';

/** What the GM keeps of one character's book; its sheet and the world map are read from the scene each time. */
export interface StoredBook {
  readonly items: readonly BookItem[];
  readonly notes: readonly BookNote[];
  readonly pins: readonly BookPin[];
  readonly purse: readonly PurseRow[];
}

/**
 * The books as kept in the companion's data: by collection id (`NO_COLLECTION` for a scene outside
 * every collection), then by character, which is its token's artwork path.
 */
export type BookData = Readonly<Record<string, Readonly<Record<string, StoredBook>>>>;

/** The collection of a scene that lies in none. */
export const NO_COLLECTION = '';

export const EMPTY_BOOK: StoredBook = { items: [], notes: [], pins: [], purse: [] };

/** The longest collection id or character key read back. */
const MAX_KEY = 1000;

interface Entry {
  readonly id: string;
}

/** The list with `entry` in place of the one of its id, else at its end; null once the list is full. */
function put<T extends Entry>(list: readonly T[], entry: T, max: number): readonly T[] | null {
  if (list.some((known) => known.id === entry.id)) return list.map((known) => (known.id === entry.id ? entry : known));
  return list.length >= max ? null : [...list, entry];
}

const without = <T extends Entry>(list: readonly T[], id: string): readonly T[] => list.filter((entry) => entry.id !== id);

/**
 * A book after what its player wrote, as the protocol's parser cleaned it: a note or pin is put in
 * place of the one of its id or added, a deletion takes one away (none is no error), the purse is
 * replaced whole. A note is stamped with `now`, the GM's clock. Null when the book takes no more.
 */
export function applyBookMessage(book: StoredBook, message: PlayerBookMessage, now: number): StoredBook | null {
  switch (message.t) {
    case 'book-note': {
      const notes = put(book.notes, { ...message.note, at: now }, MAX_BOOK_NOTES);
      return notes === null ? null : { ...book, notes };
    }
    case 'book-note-delete':
      return { ...book, notes: without(book.notes, message.id) };
    case 'book-pin': {
      const pins = put(book.pins, message.pin, MAX_BOOK_PINS);
      return pins === null ? null : { ...book, pins };
    }
    case 'book-pin-delete':
      return { ...book, pins: without(book.pins, message.id) };
    case 'book-purse':
      return { ...book, purse: message.purse };
  }
}

/** A book with an item handed over: the newest last, the oldest dropped beyond `MAX_BOOK_ITEMS`. */
export function withItem(book: StoredBook, item: BookItem): StoredBook {
  return { ...book, items: [...without(book.items, item.id), item].slice(-MAX_BOOK_ITEMS) };
}

export function isEmptyBook(book: StoredBook): boolean {
  return book.items.length + book.notes.length + book.pins.length + book.purse.length === 0;
}

/** The entries of a stored list that are well-formed, each id once, the last `max` of them. */
function readList<T extends Entry>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] {
  const read = new Map<string, T>();
  for (const entry of Array.isArray(value) ? value : []) {
    const parsed = parse(entry);
    if (parsed !== null) read.set(parsed.id, parsed);
  }
  return [...read.values()].slice(-max);
}

function readNote(value: unknown): BookNote | null {
  const draft = parseBookNoteDraft(value);
  const at: unknown = isRecord(value) ? value.at : undefined;
  return draft === null || typeof at !== 'number' || !Number.isFinite(at) || at < 0 ? null : { ...draft, at };
}

function readBook(value: unknown): StoredBook | null {
  if (!isRecord(value)) return null;
  return {
    items: readList(value.items, MAX_BOOK_ITEMS, parseBookItem),
    notes: readList(value.notes, MAX_BOOK_NOTES, readNote),
    pins: readList(value.pins, MAX_BOOK_PINS, parseBookPin),
    purse: parsePurse(value.purse) ?? [],
  };
}

/**
 * The books read from the companion's data, each part through the protocol's own parsers: an entry
 * that is malformed is dropped and the rest of its book kept, a purse that is malformed is empty.
 */
export function readBooks(data: unknown): BookData {
  const collections: [string, Record<string, StoredBook>][] = [];
  for (const [collection, characters] of Object.entries(isRecord(data) ? data : {})) {
    if (collection.length > MAX_KEY || !isRecord(characters)) continue;
    const books = Object.entries(characters).flatMap(([key, value]): [string, StoredBook][] => {
      const book = key === '' || key.length > MAX_KEY ? null : readBook(value);
      return book === null || isEmptyBook(book) ? [] : [[key, book]];
    });
    if (books.length > 0) collections.push([collection, Object.fromEntries(books)]);
  }
  return Object.fromEntries(collections);
}
