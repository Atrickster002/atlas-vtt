// @vitest-environment node
import { MAX_BOOK_QUESTS, parseGmMessage, type BookQuest, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { applyBookMessage, EMPTY_BOOK, readBooks, withoutQuest, withQuest, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH_ART, delivered, MIRA_ART, ofType, openTable, traffic } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const id = (count: number): string => count.toString(16).padStart(24, '0');
const quest = (count: number, parts: Partial<BookQuest> = {}): BookQuest => ({ id: id(count), kind: 'main', state: 'open', title: `Quest ${count}`, body: 'Find the crown.', place: { x: 0.4, y: 0.6 }, xp: 300, rewards: ['Favour of the King'], ...parts });

/** A book with these quests given, each in turn; a refused one fails the test. */
function given(quests: readonly BookQuest[], from: StoredBook = EMPTY_BOOK): StoredBook {
  return quests.reduce((book, entry) => {
    const next = withQuest(book, entry);
    if (next === null) throw new Error(`refused: ${entry.id}`);
    return next;
  }, from);
}

describe('quests in a book as the GM keeps it', () => {
  it('gives a quest, changes it in place, takes it back, and holds no more than a book takes', () => {
    const book = given([quest(1), quest(2), quest(1, { state: 'done' })]);
    expect(book.quests.map((kept) => [kept.id, kept.state])).toEqual([[id(1), 'done'], [id(2), 'open']]);
    expect(withoutQuest(book, id(1)).quests.map((kept) => kept.id)).toEqual([id(2)]);
    const full = given(Array.from({ length: MAX_BOOK_QUESTS }, (_, count) => quest(count)));
    expect(withQuest(full, quest(MAX_BOOK_QUESTS))).toBeNull();
    expect(withQuest(full, quest(3, { title: 'Changed' }))?.quests[3]?.title).toBe('Changed');
  });

  it('takes a player\'s note on a quest of their book, and on the quest it named before the GM took that back; never on one the book does not hold', () => {
    const book = given([quest(1)]);
    const onQuest = applyBookMessage(book, { t: 'book-note', note: { id: id(50), title: '', body: 'The sexton lies.', quest: id(1) } }, 7);
    expect(onQuest?.notes).toEqual([{ id: id(50), title: '', body: 'The sexton lies.', quest: id(1), at: 7 }]);
    expect(applyBookMessage(book, { t: 'book-note', note: { id: id(51), title: '', body: 'Elsewhere.', quest: id(9) } }, 7)).toBeNull();
    if (onQuest === null) throw new Error('refused');
    const takenBack = withoutQuest(onQuest, id(1));
    expect(applyBookMessage(takenBack, { t: 'book-note', note: { id: id(50), title: '', body: 'Still lies.', quest: id(1) } }, 8)?.notes[0]?.body).toBe('Still lies.');
    expect(applyBookMessage(takenBack, { t: 'book-note', note: { id: id(52), title: '', body: 'New.', quest: id(1) } }, 8)).toBeNull();
  });

  it('reads quests back through the protocol\'s parser, and every pin of a kind an older Atlas offered as the kind that took its place', () => {
    const shelf = new BookShelf();
    shelf.keep('Cairn', 'art/brannoch.png', given([quest(1)]));
    const saved = JSON.parse(JSON.stringify(shelf.toData())) as Record<string, Record<string, Record<string, unknown[]>>>;
    expect(readBooks(saved)).toEqual(shelf.toData());

    const book = saved.Cairn?.['art/brannoch.png'];
    if (book === undefined) throw new Error('no book saved');
    book.quests = [...(book.quests ?? []), { ...quest(2), kind: 'urgent' }, 'junk'];
    book.pins = ['note', 'treasure', 'danger', 'place', 'person'].map((kind, count) => ({ id: id(20 + count), x: 0.5, y: 0.5, kind, title: kind, body: '' }));
    const read = readBooks(saved).Cairn?.['art/brannoch.png'];
    expect(read?.quests.map((kept) => kept.id)).toEqual([id(1)]);
    expect(read?.pins.map((kept) => [kept.title, kept.kind])).toEqual([['note', 'note'], ['treasure', 'treasure'], ['danger', 'danger'], ['place', 'dungeon'], ['person', 'person']]);
    // A book that holds only quests is kept.
    expect(readBooks({ Cairn: { 'art/x.png': { quests: [quest(3)] } } }).Cairn?.['art/x.png']?.quests).toHaveLength(1);
  });
});

describe('quests at a running table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends a character\'s quests in its book to its player alone, keeps their notes on them, and answers a note on a quest they were not given with their book', async () => {
    const shelf = new BookShelf();
    shelf.keep('Cairn', BRANNOCH_ART, given([quest(1, { title: 'The crown under the root' })]));
    const { online, socket, from } = await openTable(shelf, [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    const last = (player: string): PlayerBook | undefined => ofType(delivered(socket), 'book').filter(({ to }) => to === player).map(({ body }) => {
      const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
      if (read?.t !== 'book') throw new Error('a book the page would not read');
      return read.book;
    }).at(-1);
    expect(last(ANA)?.quests).toEqual([quest(1, { title: 'The crown under the root' })]);
    expect(last(BEN)?.quests).toEqual([]);
    expect(traffic(delivered(socket).filter(({ to }) => to === BEN))).not.toContain('crown');

    from(ANA, { t: 'book-note', note: { id: id(60), title: '', body: 'Ask the abbot.', quest: id(1) } });
    await advance(100);
    expect(shelf.of('Cairn', BRANNOCH_ART).notes).toMatchObject([{ id: id(60), quest: id(1), body: 'Ask the abbot.' }]);

    const before = ofType(delivered(socket), 'book').filter(({ to }) => to === ANA).length;
    from(ANA, { t: 'book-note', note: { id: id(61), title: '', body: 'Not mine.', quest: id(9) } });
    // Answered with the whole book, at most one in five seconds.
    await advance(6_000);
    expect(shelf.of('Cairn', BRANNOCH_ART).notes.map((note) => note.id)).toEqual([id(60)]);
    expect(ofType(delivered(socket), 'book').filter(({ to }) => to === ANA).length).toBe(before + 1);
    expect(shelf.of('Cairn', MIRA_ART).notes).toEqual([]);
    online.stop();
  });
});
