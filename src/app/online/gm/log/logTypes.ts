import type { GmMessage, RollMode, RollRequestRef, SharedRoll } from '../../protocol/index.ts';
import type { ChatDraft, SpokenAs } from './logChat.ts';
import type { RollFace } from './logEntries.ts';

export type { ChatDraft, SpokenAs };

export interface TableLogPorts {
  send(body: GmMessage, to?: string): void;
  /** The wall clock (milliseconds), which entries are stamped with. */
  clock(): number;
  /** A steady clock for the rates. */
  now(): number;
  /** A new entry id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** A known player's name, or null. */
  nameOf(player: string): string | null;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
  /** The entries changed: panels draw anew and the log is kept. */
  changed(): void;
  /** The token `who` may speak as by `key` (a player: a token of theirs by the id players know it by; the GM: any token of the shared scene by its id), or null. */
  speaker?(who: string, key: string): Promise<SpokenAs | null>;
  /** A formula rolled now by the shared map's rules, without a throw; null where it does not roll or no map is shared. */
  rollInline?(formula: string): SharedRoll | null;
}

/** A roll as the log takes it: as players see it, whether they do, and the token the GM's own log names. */
export interface LoggedRoll {
  readonly who: string;
  readonly roll: SharedRoll;
  /** The token by the id players know it by, when they see it. */
  readonly token: string | null;
  /** False for a GM's roll the players are not shown: only the GM's log has it. */
  readonly shared: boolean;
  readonly face?: RollFace;
  /** A private roll: its mode and the people shown it; everyone else learns only that it was made. */
  readonly mode?: Exclude<RollMode, 'public'>;
  readonly to?: readonly string[];
  readonly flavor?: string;
  readonly speaker?: SpokenAs;
  readonly request?: RollRequestRef;
}

/** A roll button of the log as its presser may roll it: its formula, the mode its author set, and its label. */
export interface RollRequest {
  readonly formula: string;
  readonly mode: RollMode;
  readonly label: string;
}
