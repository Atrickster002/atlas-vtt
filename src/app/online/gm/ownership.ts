import { PLAYER_ID_PATTERN, playerName, type Claim, type PlayerInfo } from '../protocol/index.ts';
import { sideOf } from '../../initiative/sides';
import type { TokenEntity } from '../../types';

/** Who plays at the table, which tokens are theirs, and which tokens players may claim, as saved in the companion's data. */
export interface OwnershipData {
  /** Every player who joined the table, by id. */
  readonly players: Readonly<Record<string, { readonly name: string }>>;
  /** The owner of each token of the GM's scenes, by token id. */
  readonly owners: Readonly<Record<string, string>>;
  /**
   * Per scene (its map path), the tokens the GM made player tokens (true) or the GM's own (false);
   * every other token is a player token when it is on the players' side (`sideOf`: it sees).
   */
  readonly playerTokens: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
}

/** A player token of a scene, or a token a player was given, with its owner if it has one. */
export interface SeatInfo {
  readonly tokenId: string;
  readonly owner: KnownPlayer | null;
}

/** A player in the GM's list. */
export interface KnownPlayer extends PlayerInfo {
  readonly online: boolean;
}

const MAX_TOKEN_ID = 200;
const MAX_MAP_PATH = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Ownership read from saved data: players with a valid id and name, and owners that are among them. */
export function readOwnership(data: unknown): OwnershipData {
  const record = isRecord(data) ? data : {};
  const players: Record<string, { name: string }> = {};
  for (const [id, entry] of Object.entries(isRecord(record.players) ? record.players : {})) {
    const name = isRecord(entry) ? playerName(entry.name) : null;
    if (PLAYER_ID_PATTERN.test(id) && name !== null) players[id] = { name };
  }
  const owners: Record<string, string> = {};
  for (const [tokenId, owner] of Object.entries(isRecord(record.owners) ? record.owners : {})) {
    if (tokenId.length <= MAX_TOKEN_ID && typeof owner === 'string' && owner in players) owners[tokenId] = owner;
  }
  const playerTokens: Record<string, Record<string, boolean>> = {};
  for (const [mapPath, marks] of Object.entries(isRecord(record.playerTokens) ? record.playerTokens : {})) {
    if (mapPath.length > MAX_MAP_PATH || !isRecord(marks)) continue;
    const kept = Object.entries(marks).filter((entry): entry is [string, boolean] => entry[0].length <= MAX_TOKEN_ID && typeof entry[1] === 'boolean');
    if (kept.length > 0) playerTokens[mapPath] = Object.fromEntries(kept);
  }
  return { players, owners, playerTokens };
}

/** Whether a token is a player token by default: it is on the players' side, as Atlas's initiative and lighting take it (`sideOf`). */
export const isPlayerSide = (token: TokenEntity): boolean => sideOf(token) === 'players';

/**
 * The table's players, token owners and player tokens. A token has at most one owner: the player the
 * GM gave it to or who claimed it. Players may claim only player tokens nobody has; which tokens are
 * player tokens the GM decides per scene, and the rest follow the players' side. Everything but who
 * is online is saved through `save` whenever it changes; player tokens outlive a table.
 */
export class Ownership {
  private readonly players = new Map<string, string>();
  private readonly owners = new Map<string, string>();
  /** The GM's marks by map path, then token id: true for a player token, false for the GM's own. */
  private readonly marks = new Map<string, Map<string, boolean>>();
  private readonly online = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly save: (data: OwnershipData) => void;

  constructor(data: OwnershipData, save: (data: OwnershipData) => void) {
    this.save = save;
    for (const [id, { name }] of Object.entries(data.players)) this.players.set(id, name);
    for (const [tokenId, owner] of Object.entries(data.owners)) this.owners.set(tokenId, owner);
    for (const [mapPath, marks] of Object.entries(data.playerTokens)) this.marks.set(mapPath, new Map(Object.entries(marks)));
  }

  toData(): OwnershipData {
    return {
      players: Object.fromEntries([...this.players].map(([id, name]) => [id, { name }])),
      owners: Object.fromEntries(this.owners),
      playerTokens: Object.fromEntries([...this.marks].map(([mapPath, marks]) => [mapPath, Object.fromEntries(marks)])),
    };
  }

  /** Calls the listener after every change; returns the way to stop. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A new table: its players are new, so nobody is known and nothing is owned; player tokens stay. */
  reset(): void {
    this.players.clear();
    this.owners.clear();
    this.online.clear();
    this.changed(true);
  }

  /** The relay's welcome: exactly these players are connected. */
  welcome(players: readonly PlayerInfo[]): void {
    this.online.clear();
    let named = false;
    for (const player of players) {
      named = this.name(player) || named;
      this.online.add(player.id);
    }
    this.changed(named);
  }

  joined(player: PlayerInfo): void {
    const named = this.name(player);
    this.online.add(player.id);
    this.changed(named);
  }

  left(id: string): void {
    if (this.online.delete(id)) this.changed(false);
  }

  /** Forgets a player the GM removed, and gives their tokens back to nobody. */
  remove(id: string): void {
    this.online.delete(id);
    this.players.delete(id);
    for (const [tokenId, owner] of this.owners) if (owner === id) this.owners.delete(tokenId);
    this.changed(true);
  }

  /** Gives tokens to a known player, or to nobody with null. */
  give(tokenIds: readonly string[], playerId: string | null): void {
    if (playerId !== null && !this.players.has(playerId)) return;
    for (const tokenId of tokenIds) {
      if (playerId === null) this.owners.delete(tokenId);
      else if (tokenId.length <= MAX_TOKEN_ID) this.owners.set(tokenId, playerId);
    }
    this.changed(true);
  }

  ownerOf(tokenId: string): string | undefined {
    return this.owners.get(tokenId);
  }

  /** Whether a token of the scene at `mapPath` is a player token: as the GM marked it, else by its side. */
  isPlayerToken(mapPath: string, tokenId: string, token: TokenEntity): boolean {
    return this.marks.get(mapPath)?.get(tokenId) ?? isPlayerSide(token);
  }

  /** Makes tokens of a scene player tokens, or the GM's own (`false`), which also takes them back from their owners. */
  markPlayerTokens(mapPath: string, tokenIds: readonly string[], player: boolean): void {
    if (mapPath.length > MAX_MAP_PATH) return;
    const marks = this.marks.get(mapPath) ?? new Map<string, boolean>();
    for (const tokenId of tokenIds) {
      if (tokenId.length > MAX_TOKEN_ID) continue;
      marks.set(tokenId, player);
      if (!player) this.owners.delete(tokenId);
    }
    if (marks.size > 0) this.marks.set(mapPath, marks);
    this.changed(true);
  }

  /** What players may know of a token: open to claim, taken, or the GM's. */
  claimOf(mapPath: string, tokenId: string, token: TokenEntity): Claim {
    if (this.owners.has(tokenId)) return 'taken';
    return this.isPlayerToken(mapPath, tokenId, token) ? 'open' : null;
  }

  /** A player claims a token for themselves: only a known player, and only a token nobody has. The caller checks it is a player token. */
  claim(tokenId: string, playerId: string): boolean {
    if (!this.players.has(playerId) || this.owners.has(tokenId) || tokenId.length > MAX_TOKEN_ID) return false;
    this.owners.set(tokenId, playerId);
    this.changed(true);
    return true;
  }

  /** A player gives back a token of theirs; false for anyone else's. */
  release(tokenId: string, playerId: string): boolean {
    if (this.owners.get(tokenId) !== playerId) return false;
    this.owners.delete(tokenId);
    this.changed(true);
    return true;
  }

  /** The player tokens of a scene and the tokens players were given there, each with its owner, in the scene's order. */
  seats(mapPath: string, tokens: Readonly<Record<string, TokenEntity>>): SeatInfo[] {
    const players = new Map(this.list().map((player) => [player.id, player]));
    return Object.entries(tokens).flatMap(([tokenId, token]): SeatInfo[] => {
      const owner = this.owners.get(tokenId);
      if (owner === undefined && !this.isPlayerToken(mapPath, tokenId, token)) return [];
      return [{ tokenId, owner: owner === undefined ? null : players.get(owner) ?? null }];
    });
  }

  tokensOf(playerId: string): string[] {
    return [...this.owners].filter(([, owner]) => owner === playerId).map(([tokenId]) => tokenId);
  }

  /** The ids of the players connected now. */
  onlinePlayers(): string[] {
    return [...this.online];
  }

  /** The name a known player goes by, or null for anyone else. */
  nameOf(playerId: string): string | null {
    return this.players.get(playerId) ?? null;
  }

  /** Every known player: those online first, then by name. */
  list(): KnownPlayer[] {
    return [...this.players]
      .map(([id, name]) => ({ id, name, online: this.online.has(id) }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }

  /** Records a player's name; true when it is new or changed. */
  private name(player: PlayerInfo): boolean {
    if (this.players.get(player.id) === player.name) return false;
    this.players.set(player.id, player.name);
    return true;
  }

  private changed(persist: boolean): void {
    if (persist) this.save(this.toData());
    for (const listener of this.listeners) listener();
  }
}
