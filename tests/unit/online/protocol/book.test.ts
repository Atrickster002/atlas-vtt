// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bookLine, bookText, fitsPlayerFrame, MAX_BOOK_NOTES, MAX_NOTE_BODY, parseGmMessage, parsePlayerMessage, type BookItem, type PlayerBook,
} from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);
const ID = '0123456789abcdef01234567';
const ART = { hash: HASH, size: 10, mime: 'image/webp' };
const ITEM: BookItem = { id: ID, name: 'Rope', type: 'Gear', rarity: 'Common', tone: 'common', price: '1 gold', description: 'Fifty feet.\nHemp.', properties: [{ label: 'Weight', value: '5' }], at: 12 };
const BOOK: PlayerBook = {
  character: { name: 'Ana', art: ART, ring: '#ffffff', resources: [{ name: 'HP', colour: '#aa0000', direction: 'drains', current: 3, max: 8 }] },
  worldMap: { image: ART, width: 4000, height: 3000 },
  items: [ITEM],
  notes: [{ id: ID, title: 'Lead', body: 'Ask the miller.', at: 5 }],
  pins: [{ id: ID, x: 0.5, y: 1, kind: 'danger', title: 'Bog', body: '' }],
  purse: [{ name: 'gold', amount: 12 }],
};

describe('book messages to a player', () => {
  it('read a whole book, a sheet alone and an item', () => {
    expect(parseGmMessage({ t: 'book', book: BOOK })).toEqual({ t: 'book', book: BOOK });
    expect(parseGmMessage({ t: 'book-sheet', character: null })).toEqual({ t: 'book-sheet', character: null });
    expect(parseGmMessage({ t: 'book-item', item: ITEM })).toEqual({ t: 'book-item', item: ITEM });
  });

  it('read a book without character, map or entries', () => {
    const empty = { character: null, worldMap: null, items: [], notes: [], pins: [], purse: [] };
    expect(parseGmMessage({ t: 'book', book: empty })).toEqual({ t: 'book', book: empty });
  });

  it('refuse malformed books', () => {
    const broken: unknown[] = [
      { ...BOOK, items: [{ ...ITEM, id: 'x' }] },
      { ...BOOK, items: [ITEM, ITEM] },
      { ...BOOK, items: [{ ...ITEM, tone: 'shiny' }] },
      { ...BOOK, character: { ...BOOK.character, ring: 'red' } },
      { ...BOOK, character: { ...BOOK.character, art: { hash: HASH, size: 1, mime: 'text/html' } } },
      { ...BOOK, character: { ...BOOK.character, resources: [{ name: 'HP', colour: '#aa0000', direction: 'drains', current: 1, max: 0 }] } },
      { ...BOOK, worldMap: { image: ART, width: 0, height: 10 } },
      { ...BOOK, pins: [{ ...BOOK.pins[0], x: 1.2 }] },
      { ...BOOK, pins: [{ ...BOOK.pins[0], kind: 'quest' }] },
      { ...BOOK, purse: [{ name: 'gold', amount: -1 }] },
      { ...BOOK, notes: Array.from({ length: MAX_BOOK_NOTES + 1 }, () => BOOK.notes[0]) },
    ];
    for (const book of broken) expect(parseGmMessage({ t: 'book', book }), JSON.stringify(book).slice(0, 120)).toBeNull();
  });
});

describe('what a player writes into their book', () => {
  it('reads notes, pins, the purse and deletions, cleaned', () => {
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '  A‮ title ', body: 'one\r\n\r\n\r\n\r\ntwo  \n' } })).toEqual({ t: 'book-note', note: { id: ID, title: 'A title', body: 'one\n\ntwo' } });
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '', body: '' } })).toEqual({ t: 'book-note', note: { id: ID, title: '', body: '' } });
    expect(parsePlayerMessage({ t: 'book-pin', pin: BOOK.pins[0] })).toEqual({ t: 'book-pin', pin: BOOK.pins[0] });
    expect(parsePlayerMessage({ t: 'book-note-delete', id: ID })).toEqual({ t: 'book-note-delete', id: ID });
    expect(parsePlayerMessage({ t: 'book-pin-delete', id: ID })).toEqual({ t: 'book-pin-delete', id: ID });
    expect(parsePlayerMessage({ t: 'book-purse', purse: BOOK.purse })).toEqual({ t: 'book-purse', purse: BOOK.purse });
  });

  it('refuses what is malformed or too long, and never takes a GM kind from a player', () => {
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: 't', body: 'x'.repeat(MAX_NOTE_BODY + 1) } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: 'x'.repeat(81), body: '' } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-note-delete', id: '../x' })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-pin', pin: { ...BOOK.pins[0], y: Number.NaN } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-purse', purse: [{ name: 'gold', amount: 1.5 }] })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-item', item: ITEM })).toBeNull();
    expect(parsePlayerMessage({ t: 'book', book: BOOK })).toBeNull();
    expect(parseGmMessage({ t: 'book-note', note: { id: ID, title: '', body: '' } })).toBeNull();
  });
});

describe('book texts', () => {
  it('keep indents and single blank lines, and drop marks that do not show', () => {
    expect(bookText('- a\n  - b​\n\n\n\nc', 100)).toBe('- a\n  - b\n\nc');
    expect(bookLine('​', 10)).toBeNull();
    expect(bookLine('', 10, true)).toBe('');
  });

  it('say whether a note fits one player frame', () => {
    expect(fitsPlayerFrame({ t: 'book-note', note: { id: ID, title: 't', body: 'x'.repeat(MAX_NOTE_BODY) } })).toBe(true);
    expect(fitsPlayerFrame({ t: 'book-note', note: { id: ID, title: 't', body: '語'.repeat(MAX_NOTE_BODY) } })).toBe(false);
  });
});
