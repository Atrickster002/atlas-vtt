import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import type { PlayedCharacter } from './characters.ts';
import type { StatblockWriteOutcome } from './statblockGate.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import { StatblockSheets } from './statblockSheets.ts';

export interface StatblockSharePorts {
  read(path: string): Promise<ResolvedStatblock | null>;
  write(path: string, patches: readonly NotePatch[]): Promise<StatblockWriteOutcome>;
  now(): number;
  /** A statblock was read or drawn anew, or an edit is under way: the books are looked at again. */
  changed(): void;
  /** A player's edit was taken: they are sent their statblock again, whether or not it reads otherwise. */
  answered(player: string): void;
  /** A player's edit was refused once it was written: they are owed their whole book. */
  owe(player: string): void;
}

const NO_STATBLOCK: DrawnStatblock = { statblock: null, texts: [] };

/**
 * The players' own characters' statblocks: each character's note drawn as its player is sent it,
 * and the whole texts it names served to that player alone.
 */
export class StatblockShare {
  private readonly sheets: StatblockSheets;
  /** What each player was last sent of their statblock. */
  private readonly sentTo = new Map<string, DrawnStatblock>();

  constructor(private readonly ports: StatblockSharePorts) {
    this.sheets = new StatblockSheets({ read: (path) => ports.read(path), now: () => ports.now(), changed: () => ports.changed() });
  }

  /** The statblock a character's player gets now: none without a note, undefined while its note is read or drawn. */
  of(character: PlayedCharacter | null): DrawnStatblock | undefined {
    if (character === null || character.statblockPath === null) return NO_STATBLOCK;
    return this.sheets.drawn(character.statblockPath, character.drawnWith.definitions, character.drawnWith.resources);
  }

  /** What a player was sent of their statblock: null when a book went without one. */
  sent(player: string, drawn: DrawnStatblock | null): void {
    if (drawn === null) this.sentTo.delete(player);
    else this.sentTo.set(player, drawn);
  }

  /** The player left: what they were sent no longer counts. */
  left(player: string): void {
    this.sentTo.delete(player);
  }

  /** A whole text of the statblock this player was last sent, by hash; nothing for any other. */
  text(hash: string, player: string): Uint8Array<ArrayBuffer> | undefined {
    return this.sentTo.get(player)?.texts.find((asset) => asset.ref.hash === hash)?.bytes;
  }

  /** A note may read otherwise (every note for null): it is read again. */
  changed(path: string | null): void {
    this.sheets.forget(path);
  }

  /** Only the notes of characters still played are kept. */
  retain(paths: ReadonlySet<string>): void {
    this.sheets.retain(paths);
  }
}
