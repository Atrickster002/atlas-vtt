import { isPlayerBookType, isRecord, parsePlayerBookMessage, parsePlayerMessage, type GmMessage, type PlayerBook } from '../../protocol/index.ts';
import type { LootRecipient, LootRecipientSource } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import { ArtRefs } from '../artRefs.ts';
import { AssetAnswers } from '../assetAnswers.ts';
import type { ScaleImage } from '../assetVariants.ts';
import { every, type Timers } from '../companionTimers.ts';
import { MoveRate } from '../moveCheck.ts';
import type { KnownPlayer } from '../ownership.ts';
import type { VaultImage } from '../TokenShare.ts';
import { bookItemOf } from './bookItem.ts';
import type { BookScene } from './bookScene.ts';
import type { BookShelf } from './BookShelf.ts';
import { sheetOf } from './bookSheet.ts';
import { applyBookMessage, EMPTY_BOOK, withItem } from './bookStore.ts';
import { Characters, type PlayedCharacter } from './characters.ts';
import { WorldMaps, type FileStat, type WorldMapFile } from './worldMap.ts';

export interface BookSharePorts extends Timers {
  send(body: GmMessage, to: string): void;
  /** The GM's clock, which notes and items are stamped with. */
  clock(): number;
  /** A new item's id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The shared scene as the books read it, or null while none is shown: the books then stay as they were. */
  scene(): BookScene | null;
  /** Everyone the table knows, and who of them is connected. */
  players(): readonly KnownPlayer[];
  ownerOf(tokenId: string): string | undefined;
  readImage(path: string): Promise<VaultImage | null>;
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** Whether the image at a vault path may be shown to players as a collection's world map. */
  mayShowWorldMap(collection: string, path: string): Promise<boolean>;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage | undefined;
}

/** How often the scene is read again: a sheet follows its token within this time, however often the store changes. */
export const BOOK_POLL_MS = 400;
/** What a player may write into their book: a burst of `BOOK_BURST` edits, then `BOOK_WRITES_PER_SECOND`. */
export const BOOK_BURST = 30;
export const BOOK_WRITES_PER_SECOND = 2;
/**
 * The shortest time between two whole books sent to one player in answer to what was refused of
 * them: the first refusal is answered at once, a flood of them with one book per this time.
 */
export const REFUSAL_BOOK_MS = 5_000;

/** What a character without a name is called where the GM picks who gets an item. */
const UNNAMED = 'Unnamed character';

interface SentBook {
  /** The character the book is of, by collection and key; empty for none. */
  readonly book: string;
  readonly map: string;
  readonly sheet: string;
}

/**
 * The players' books: each connected player's own pages besides the table, sent to that player
 * alone and never to all. A book is its character's (`Characters`): the sheet is read from the
 * shared scene, items, notes, pins and purse are kept on the shelf, and the collection's world map
 * goes to everyone at the table. It is the table's, not a scene's, so it hears players while no
 * scene is shared. What a player writes is taken as the protocol's parser cleaned it, only for a
 * player with a character and within their rate; a write that is refused is answered with the
 * whole book. A player is served their own character's artwork and the world map by hash, and
 * nobody another character's.
 */
export class BookShare implements LootRecipientSource {
  private readonly ports: BookSharePorts;
  private readonly shelf: BookShelf;
  private readonly characters = new Characters();
  private readonly art: ArtRefs;
  private readonly maps: WorldMaps;
  private readonly answers: AssetAnswers;
  private readonly rate = new MoveRate(BOOK_BURST, BOOK_WRITES_PER_SECOND);
  /** The world map of the collection last shown. */
  private worldMap: WorldMapFile | null = null;
  private mapPath: string | null = null;
  /** What each connected player was last sent. */
  private readonly sent = new Map<string, SentBook>();
  /** When each player was last sent a whole book, and the timers of those who are owed one. */
  private readonly bookAt = new Map<string, number>();
  private readonly owed = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private told = '[]';
  private stopPoll: (() => void) | null = null;

  constructor(ports: BookSharePorts, shelf: BookShelf) {
    this.ports = ports;
    this.shelf = shelf;
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update());
    this.maps = new WorldMaps({ stat: (path) => ports.stat(path), readImage: (path) => ports.readImage(path), mayShow: (collection, path) => ports.mayShowWorldMap(collection, path), read: () => this.update() });
    this.answers = new AssetAnswers({ send: (body, to) => ports.send(body, to), now: () => ports.now(), readImage: (path) => ports.readImage(path), scaleImage: ports.scaleImage }, {
      map: () => null,
      explored: () => undefined,
      artPath: (hash, player) => this.assetPath(hash, player),
    });
  }

  start(): void {
    this.stopPoll ??= every(this.ports, BOOK_POLL_MS, () => this.update());
    this.update();
  }

  stop(): void {
    this.stopPoll?.();
    this.stopPoll = null;
    for (const timer of this.owed.values()) this.ports.clearTimer(timer);
    this.owed.clear();
  }

  /** A collection's settings changed: the world map is read anew, since another image may be it now or this one no longer. */
  settingsChanged(): void {
    this.maps.forget();
    this.update();
  }

  /** Reads the scene again and sends each connected player what changed for them: the whole book, or the sheet alone. */
  update(): void {
    const scene = this.ports.scene();
    const players = this.ports.players();
    if (scene !== null) {
      const map = this.maps.get(scene.worldMap, scene.collection);
      // Being read: the books go out once it is known, with it.
      if (map === undefined) return;
      this.worldMap = map;
      this.read(scene, new Set(players.map((player) => player.id)));
    }
    const online = new Set(players.filter((player) => player.online).map((player) => player.id));
    for (const player of [...this.sent.keys()]) if (!online.has(player)) this.sent.delete(player);
    for (const player of online) this.sync(player);
    this.tell();
  }

  /** The books again, to one player or to all; sent to all, their assets may be asked for again at once. */
  resend(to?: string): void {
    if (to === undefined) {
      this.sent.clear();
      this.answers.forget();
    } else this.sent.delete(to);
    this.update();
  }

  /** A player left the table: chunks queued for them are dropped, and they get their book anew when they are back. */
  playerLeft(player: string): void {
    this.answers.forget(player);
    this.sent.delete(player);
  }

  /**
   * A player's message: true when it was the book's, so nobody else reads it. That is a write into
   * their book, and a request for an asset only their book names (their character's artwork while
   * the scene does not show it, the world map).
   */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body)) return false;
    if (body.t === 'asset-request') {
      const request = parsePlayerMessage(body);
      if (request?.t !== 'asset-request' || this.assetPath(request.hash, from) === undefined) return false;
      this.answers.answer(from, request);
      return true;
    }
    if (!isPlayerBookType(body.t)) return false;
    if (!this.write(from, body)) this.owe(from);
    return true;
  }

  recipients(): LootRecipient[] {
    return this.ports.players().filter((player) => player.online).map(({ id, name }) => {
      const character = this.characters.of(id);
      return { id, name, character: character === null ? null : character.sheet.name || UNNAMED };
    });
  }

  /** Hands a rolled item to a connected player's character: kept in its book and sent to that player alone. */
  give(recipientId: string, draw: LootDraw): boolean {
    const character = this.isOnline(recipientId) ? this.characters.of(recipientId) : null;
    const item = character === null ? null : bookItemOf(draw, this.ports.randomId(), this.ports.clock());
    if (character === null || item === null) return false;
    this.shelf.keep(character.collection, character.key, withItem(this.shelf.of(character.collection, character.key), item));
    this.ports.send({ t: 'book-item', item }, recipientId);
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Who plays which character in the scene, with the artwork of a new scene read afresh. */
  private read(scene: BookScene, known: ReadonlySet<string>): void {
    if (scene.mapPath !== this.mapPath) this.art.clear();
    this.mapPath = scene.mapPath;
    this.characters.update(scene, {
      ownerOf: (tokenId) => this.ports.ownerOf(tokenId),
      isKnown: (player) => known.has(player),
      sheet: (shown, token) => sheetOf(shown, token, scene.resources, (path) => this.art.get(path)),
    });
  }

  private sync(player: string): void {
    const character = this.characters.of(player);
    const now = sentOf(character, this.worldMap);
    const last = this.sent.get(player);
    if (last === undefined || last.book !== now.book || last.map !== now.map) return this.sendBook(player);
    if (last.sheet === now.sheet) return;
    this.sent.set(player, now);
    this.ports.send({ t: 'book-sheet', character: character?.sheet ?? null }, player);
  }

  private sendBook(player: string): void {
    const timer = this.owed.get(player);
    if (timer !== undefined) this.ports.clearTimer(timer);
    this.owed.delete(player);
    if (!this.isOnline(player)) return;
    const character = this.characters.of(player);
    const { items, notes, pins, purse } = character === null ? EMPTY_BOOK : this.shelf.of(character.collection, character.key);
    const book: PlayerBook = { character: character?.sheet ?? null, worldMap: this.worldMap?.map ?? null, items, notes, pins, purse };
    this.sent.set(player, sentOf(character, this.worldMap));
    this.bookAt.set(player, this.ports.now());
    this.ports.send({ t: 'book', book }, player);
  }

  /** The player is owed their whole book (a write of theirs was refused): now, or once `REFUSAL_BOOK_MS` have passed since their last. */
  private owe(player: string): void {
    if (this.owed.has(player)) return;
    const wait = (this.bookAt.get(player) ?? Number.NEGATIVE_INFINITY) + REFUSAL_BOOK_MS - this.ports.now();
    if (wait <= 0) return this.sendBook(player);
    this.owed.set(player, this.ports.setTimer(() => {
      this.owed.delete(player);
      this.sendBook(player);
    }, wait));
  }

  /** Writes what a player sent into their character's book; false when it is refused. */
  private write(from: string, body: Record<string, unknown>): boolean {
    if (!this.rate.take(from, this.ports.now())) return false;
    const character = this.characters.of(from);
    const message = parsePlayerBookMessage(body);
    if (character === null || message === null || !this.isOnline(from)) return false;
    const written = applyBookMessage(this.shelf.of(character.collection, character.key), message, this.ports.clock());
    if (written === null) return false;
    this.shelf.keep(character.collection, character.key, written);
    return true;
  }

  /** The vault path of an asset only this player's book names, by hash: the world map, or their own character's artwork. */
  private assetPath(hash: string, player: string): string | undefined {
    if (!this.isOnline(player)) return undefined;
    if (this.worldMap?.map.image.hash === hash) return this.worldMap.path;
    const character = this.characters.of(player);
    return character?.sheet.art?.hash === hash ? character.key : undefined;
  }

  private isOnline(player: string): boolean {
    return this.ports.players().some((known) => known.id === player && known.online);
  }

  /** Tells who listens when the people an item can be handed to changed. */
  private tell(): void {
    const recipients = JSON.stringify(this.recipients());
    if (recipients === this.told) return;
    this.told = recipients;
    for (const listener of [...this.listeners]) listener();
  }
}

function sentOf(character: PlayedCharacter | null, worldMap: WorldMapFile | null): SentBook {
  return {
    book: character === null ? '' : `${character.collection}\n${character.key}`,
    map: worldMap === null ? '' : JSON.stringify(worldMap.map),
    sheet: JSON.stringify(character?.sheet ?? null),
  };
}
