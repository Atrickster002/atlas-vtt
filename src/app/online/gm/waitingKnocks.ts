import type { PlayerInfo } from '../protocol/index.ts';
import type { Timers } from './companionTimers.ts';

/**
 * How long a card takes no answer after it first showed, and again after it may have moved: whoever
 * knocks chooses the moment their card appears, so a press or a key meant for something else that
 * lands on it must do nothing.
 */
export const ARM_MS = 700;
/** How long a card says that its table was full. */
export const FULL_NOTE_MS = 4_000;

/** A newcomer who waits for the GM's answer. */
export interface WaitingPlayer extends PlayerInfo {
  /** The GM answered; the relay has not confirmed yet. */
  readonly answered: boolean;
  /** The GM admitted them, but the table had filled meanwhile. */
  readonly full: boolean;
  /** The card has stood in its place for `ARM_MS`: until then it takes no answer, and looks it. */
  readonly armed: boolean;
}

/**
 * The newcomers who wait, in the order they knocked, each with the time its card has stood where it
 * stands. That time is kept here, with the knock, and not with what is drawn: drawing the cards anew
 * neither starts it again nor skips it. A later knock goes after the earlier ones and leaves their
 * time alone. When a card leaves, or the cards may have moved on screen (`moved`), the others start
 * again, since one of them may now lie under the pointer or have the keyboard's focus. One timer
 * tells of the cards that came due together, once.
 */
export class WaitingKnocks {
  private list: readonly WaitingPlayer[] = [];
  /** Since when each card has stood where it stands, by its player's id. */
  private readonly since = new Map<string, number>();
  private armTimer: number | undefined;
  /** The timers of the cards that say their table was full. */
  private readonly notes = new Map<string, number>();
  private readonly timers: Timers;
  private readonly changed: () => void;

  constructor(timers: Timers, changed: () => void) {
    this.timers = timers;
    this.changed = changed;
  }

  get players(): readonly WaitingPlayer[] {
    return this.list;
  }

  /** The relay's welcome: who waits now. A card that keeps its place keeps its time; an answer under way is void. */
  welcomed(waiting: readonly PlayerInfo[]): void {
    this.clearNotes();
    const now = this.timers.now();
    const kept = waiting.map((player, index) => (this.list[index]?.id === player.id ? this.since.get(player.id) ?? now : now));
    this.since.clear();
    this.list = waiting.map((player, index) => {
      this.since.set(player.id, kept[index] ?? now);
      return { ...player, answered: false, full: false, armed: false };
    });
    this.arm();
    this.changed();
  }

  /** A newcomer knocked: their card goes after the others. A knock already shown changes nothing. */
  knocked(player: PlayerInfo): void {
    if (this.since.has(player.id)) return;
    this.since.set(player.id, this.timers.now());
    this.list = [...this.list, { ...player, answered: false, full: false, armed: false }];
    this.arm();
    this.changed();
  }

  /** A knock ended. One admitted into a table that had filled says so for a moment before its card goes. */
  gone(id: string, full: boolean): void {
    if (!full) return this.remove(id);
    if (!this.since.has(id) || this.notes.has(id)) return;
    this.list = this.list.map((player) => (player.id === id ? { ...player, answered: true, full: true } : player));
    this.notes.set(id, this.timers.setTimer(() => this.remove(id), FULL_NOTE_MS));
    this.changed();
  }

  /** The cards may have moved on screen: each takes no answer again until it has stood for `ARM_MS`. */
  moved(): void {
    if (this.list.length === 0) return;
    this.restart();
    if (this.arm()) this.changed();
  }

  /**
   * Marks a waiting player as answered; false when there is none to answer, the answer is under way,
   * or the card has not stood long enough to be meant.
   */
  answer(id: string): boolean {
    const player = this.list.find((other) => other.id === id);
    if (player === undefined || player.answered || !player.armed) return false;
    this.list = this.list.map((other) => (other.id === id ? { ...other, answered: true } : other));
    this.changed();
    return true;
  }

  /** No timer is left running. */
  dispose(): void {
    this.clearNotes();
    if (this.armTimer !== undefined) this.timers.clearTimer(this.armTimer);
    this.armTimer = undefined;
  }

  private remove(id: string): void {
    const note = this.notes.get(id);
    if (note !== undefined) this.timers.clearTimer(note);
    this.notes.delete(id);
    if (!this.since.delete(id)) return;
    this.list = this.list.filter((player) => player.id !== id);
    // The others close up: one of them may take the place of the card that was just pressed.
    this.restart();
    this.arm();
    this.changed();
  }

  private restart(): void {
    const now = this.timers.now();
    for (const player of this.list) this.since.set(player.id, now);
  }

  /** Sets each card's `armed` by the clock and times the next card that comes due; whether any changed. */
  private arm(): boolean {
    const now = this.timers.now();
    let next = Number.POSITIVE_INFINITY;
    const list: WaitingPlayer[] = [];
    for (const player of this.list) {
      const left = (this.since.get(player.id) ?? now) + ARM_MS - now;
      const armed = left <= 0;
      if (left > 0) next = Math.min(next, left);
      list.push(player.armed === armed ? player : { ...player, armed });
    }
    const flipped = list.some((player, index) => player !== this.list[index]);
    if (flipped) this.list = list;
    if (this.armTimer !== undefined) this.timers.clearTimer(this.armTimer);
    this.armTimer = next === Number.POSITIVE_INFINITY ? undefined : this.timers.setTimer(() => {
      this.armTimer = undefined;
      if (this.arm()) this.changed();
    }, next);
    return flipped;
  }

  private clearNotes(): void {
    for (const note of this.notes.values()) this.timers.clearTimer(note);
    this.notes.clear();
  }
}
