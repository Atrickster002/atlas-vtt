import { companionTimers, type Timers } from './companionTimers.ts';

/** What the queue needs of a socket. */
export interface QueueSocket {
  readonly bufferedAmount: number;
  send(text: string): void;
}

/** Frames a second the queue sends at most over time, below the relay's GM rate limit (100). */
export const FRAMES_PER_SECOND = 80;
/** Frames the queue may send at once after a quiet spell, well below the relay's burst (200). */
export const BURST = 40;
/** Bytes the socket may hold unsent before even a live frame waits. */
export const MAX_BUFFERED = 1024 * 1024;
/**
 * Bytes the socket may hold unsent before other frames wait: about one asset chunk, so a live frame
 * never queues behind more than that on a slow uplink.
 */
export const BULK_BUFFERED = 64 * 1024;
/** How soon the queue looks again while the socket drains. */
const DRAIN_CHECK_MS = 10;

/** The clock and timers the queue paces with; the companion's in Obsidian, fakes in tests. */
export type QueueClock = Timers;

interface QueuedFrame {
  readonly text: string;
  /** The player or players (`ALL_PLAYERS`) a game message goes to; unset for the GM's own requests. */
  readonly to: string | undefined;
}

/**
 * Frames in two lanes, under the relay's rate limit (a token bucket) and the socket's buffer: live
 * frames (`pushLive`) keep only the latest of each key and go first; every other frame goes in order
 * after them, and only while the socket holds little unsent, so a large asset never holds a live
 * frame back for long. Frames wait while no socket is attached and go out once one is.
 */
export class SendQueue {
  private frames: QueuedFrame[] = [];
  private live = new Map<string, QueuedFrame>();
  private socket: QueueSocket | null = null;
  private timer: number | undefined;
  private tokens = BURST;
  private filledAt: number;
  private readonly clock: QueueClock;

  constructor(clock: QueueClock = companionTimers()) {
    this.clock = clock;
    this.filledAt = clock.now();
  }

  get length(): number {
    return this.frames.length + this.live.size;
  }

  /** Queues a frame; `to` names who a game message is for, so it can be dropped once they are gone. */
  push(frame: string, to?: string): void {
    this.frames.push({ text: frame, to });
    this.pump();
  }

  /** Queues a live frame: it replaces a waiting one of the same key and goes before every other frame. */
  pushLive(key: string, frame: string, to?: string): void {
    this.live.delete(key);
    this.live.set(key, { text: frame, to });
    this.pump();
  }

  /** Drops the waiting game messages for recipients that are gone. */
  drop(gone: (to: string) => boolean): void {
    const kept = (frame: QueuedFrame): boolean => frame.to === undefined || !gone(frame.to);
    this.frames = this.frames.filter(kept);
    this.live = new Map([...this.live].filter(([, frame]) => kept(frame)));
  }

  attach(socket: QueueSocket): void {
    this.socket = socket;
    this.pump();
  }

  detach(): void {
    this.socket = null;
    if (this.timer !== undefined) this.clock.clearTimer(this.timer);
    this.timer = undefined;
  }

  /** Sends what the rate and the socket allow now and schedules the rest. */
  pump(): void {
    if (this.socket === null || this.timer !== undefined) return;
    for (;;) {
      const next = this.next();
      if (next === null) return;
      this.refill();
      if (this.tokens < 1) return this.wait(((1 - this.tokens) * 1000) / FRAMES_PER_SECOND);
      if (this.socket.bufferedAmount > (next.live ? MAX_BUFFERED : BULK_BUFFERED)) return this.wait(DRAIN_CHECK_MS);
      if (next.live) this.live.delete(next.key);
      else this.frames.shift();
      this.tokens -= 1;
      this.socket.send(next.frame.text);
    }
  }

  /** The frame to send next: the oldest live one, else the oldest of the others. */
  private next(): { readonly frame: QueuedFrame; readonly live: true; readonly key: string } | { readonly frame: QueuedFrame; readonly live: false } | null {
    const [live] = this.live;
    if (live !== undefined) return { frame: live[1], live: true, key: live[0] };
    const frame = this.frames[0];
    return frame === undefined ? null : { frame, live: false };
  }

  private refill(): void {
    const now = this.clock.now();
    this.tokens = Math.min(BURST, this.tokens + ((now - this.filledAt) * FRAMES_PER_SECOND) / 1000);
    this.filledAt = now;
  }

  private wait(ms: number): void {
    this.timer = this.clock.setTimer(() => {
      this.timer = undefined;
      this.pump();
    }, Math.max(1, Math.ceil(ms)));
  }
}
