import { chatText, GM_AUTHOR, isLogReaction, isPlayerLogType, isRecord, LOG_REACTIONS, MAX_LOG_ENTRIES, MAX_PLAYERS, parseLogEntry, parsePlayerLog, quoting, replyPreview, type ChatRefusal, type GmMessage, type LogEntry, type LogReaction, type LogReactionEmoji, type LogReply, type PlayerInfo, type PlayerLogMessage, type SharedRoll } from '../../protocol/index.ts';
import { MoveRate } from '../moveCheck.ts';
import { entriesWithin, readSavedLog, sharedEntry, type GmLogEntry, type RollFace, type SavedLog } from './logEntries.ts';

/** Messages and edits a player may send: a burst of `CHAT_BURST`, then one every two seconds. */
export const CHAT_BURST = 5;
export const CHATS_PER_SECOND = 0.5;
/** Reactions and deletions a player may send: a burst of `REACT_BURST`, then `REACTS_PER_SECOND`. */
export const REACT_BURST = 10;
export const REACTS_PER_SECOND = 2;
/** Refusals a player is told: a burst of `REFUSAL_BURST`, then one a second. A player far over their rate is not answered every time. */
export const REFUSAL_BURST = 2;
export const REFUSALS_PER_SECOND = 1;
/** A player who is back within this time left no line: a phone that slept, a page loaded anew. */
export const LEAVE_GRACE_MS = 30_000;
/** What a joining player is sent of the log, and what is kept with the table: the newest entries that fit. */
export const LOG_SNAPSHOT_BYTES = 150 * 1024;
/** The GM's name in the log; a client shows its own word for it. */
export const GM_NAME = 'GM';

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
}

/**
 * The table's log, kept by the GM: chat messages, rolls, and who came and went. Players' messages are
 * taken only as checked (shape and text by the protocol's parser, the sender as the relay stamped it,
 * their rate, and that what they edit or delete is their own) and every change goes to all players;
 * a player who joins is sent the newest entries. Entries only the GM has (`hidden`) are never sent and
 * are counted apart, so nothing players hold tells of them. Nothing is kept that a client would not
 * read (`parseLogEntry`), since one such entry would be left out of every log a joiner is sent.
 */
export class TableLog {
  private readonly ports: TableLogPorts;
  private list: GmLogEntry[];
  private readonly chatRate = new MoveRate(CHAT_BURST, CHATS_PER_SECOND);
  private readonly reactRate = new MoveRate(REACT_BURST, REACTS_PER_SECOND);
  private readonly refusalRate = new MoveRate(REFUSAL_BURST, REFUSALS_PER_SECOND);
  /** The players the log counts as at the table: a line said they joined, none yet that they left. */
  private readonly present = new Set<string>();
  /** Players who left and may be back in time, with the timer of their line. */
  private readonly leaving = new Map<string, number>();
  private readonly names = new Map<string, string>();

  constructor(ports: TableLogPorts, saved: unknown = undefined) {
    this.ports = ports;
    const kept = readSavedLog(saved);
    this.list = kept.entries;
    for (const entry of this.list) if (entry.who !== GM_AUTHOR) this.names.set(entry.who, entry.name);
    // Who was there is kept beside the entries: their lines may have left the log, or the GM cleared it.
    for (const id of kept.present) this.present.add(id);
  }

  /** Every entry, oldest first; the same array while nothing changed. */
  entries(): readonly GmLogEntry[] {
    return this.list;
  }

  /** The log as kept with the table: the newest entries that fit `LOG_SNAPSHOT_BYTES`, and who is counted as there. */
  saved(): SavedLog {
    return { entries: entriesWithin(this.list, LOG_SNAPSHOT_BYTES), present: [...this.present] };
  }

  /** The relay's welcome: exactly these players are connected. */
  welcome(players: readonly PlayerInfo[]): void {
    const here = new Set(players.map((player) => player.id));
    for (const player of players) this.joined(player);
    for (const id of this.present) if (!here.has(id)) this.left(id);
  }

  joined(player: PlayerInfo): void {
    this.names.set(player.id, player.name);
    const timer = this.leaving.get(player.id);
    if (timer !== undefined) {
      this.ports.clearTimer(timer);
      this.leaving.delete(player.id);
      return;
    }
    if (this.present.has(player.id)) return;
    this.present.add(player.id);
    this.add({ ...this.stamp(player.id, player.name), kind: 'joined' });
  }

  left(id: string): void {
    if (!this.present.has(id) || this.leaving.has(id)) return;
    this.leaving.set(id, this.ports.setTimer(() => {
      this.leaving.delete(id);
      this.present.delete(id);
      const name = this.nameOf(id);
      if (name !== null) this.add({ ...this.stamp(id, name), kind: 'left' });
    }, LEAVE_GRACE_MS));
  }

  /** A roll made at the table. */
  rolled(roll: LoggedRoll): void {
    const name = this.nameOf(roll.who);
    if (name === null) return;
    this.add({
      ...this.stamp(roll.who, name), kind: 'roll', roll: roll.roll, token: roll.token,
      ...(!roll.shared && { hidden: true as const }),
      ...(roll.face !== undefined && { face: roll.face }),
    });
  }

  /** The GM says something; false when nothing of the text shows or it is too long. */
  say(text: string, reply?: string): boolean {
    return this.chat(GM_AUTHOR, text, reply);
  }

  /** The GM changes a message of their own. */
  edit(id: string, text: string): boolean {
    return this.changeText(GM_AUTHOR, id, text) === null;
  }

  /** The GM deletes a chat message, their own or a player's. */
  remove(id: string): void {
    const entry = this.find(id);
    if (entry?.kind === 'chat') this.drop(entry);
  }

  /** The GM gives or takes back a reaction. */
  react(id: string, emoji: LogReactionEmoji, on: boolean): void {
    this.setReaction(GM_AUTHOR, id, emoji, on);
  }

  /** Empties the log, for everyone. */
  clear(): void {
    if (this.list.length === 0) return;
    this.list = [];
    this.ports.send({ t: 'log', entries: [] });
    this.ports.changed();
  }

  /** The log to one player (who joined) or to all (the GM is back): the newest shared entries that fit. */
  resend(to?: string): void {
    const shared = this.list.filter((entry) => entry.hidden !== true).map(sharedEntry);
    this.ports.send({ t: 'log', entries: entriesWithin(shared, LOG_SNAPSHOT_BYTES) }, to);
  }

  /** A player's message; false when it is none of the log's, which the scene then reads. */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body) || !isPlayerLogType(body.t)) return false;
    // Only someone the table knows by name speaks: the relay stamps `from`, the name comes from its welcome.
    if (this.nameOf(from) === null) return true;
    const writes = body.t === 'chat' || body.t === 'chat-edit';
    if (!(writes ? this.chatRate : this.reactRate).take(from, this.ports.now())) return this.refuse('rate', from);
    const message = parsePlayerLog(body);
    if (message === null) return writes ? this.refuse('text', from) : true;
    const refusal = this.apply(from, message);
    return refusal === null ? true : this.refuse(refusal, from);
  }

  /** Stops the timers of players who may be back: nothing is written after the table ended. */
  dispose(): void {
    for (const timer of this.leaving.values()) this.ports.clearTimer(timer);
    this.leaving.clear();
  }

  private apply(from: string, message: PlayerLogMessage): ChatRefusal | null {
    if (message.t === 'chat') return this.chat(from, message.text, message.reply) ? null : 'text';
    if (message.t === 'chat-edit') return this.changeText(from, message.id, message.text);
    if (message.t === 'react') return this.setReaction(from, message.id, message.emoji, message.on) ? null : 'gone';
    const entry = this.shared(message.id);
    if (entry?.kind !== 'chat' || entry.who !== from) return 'gone';
    this.drop(entry);
    return null;
  }

  private chat(who: string, raw: string, reply?: string): boolean {
    const text = chatText(raw);
    const name = this.nameOf(who);
    if (text === null || name === null) return false;
    // An answer to an entry that is gone by now is still said, as a message of its own.
    const answered = reply === undefined ? undefined : this.shared(reply);
    this.add({ ...this.stamp(who, name), kind: 'chat', text, ...(answered !== undefined && { reply: replyTo(answered) }) });
    return true;
  }

  private changeText(who: string, id: string, raw: string): ChatRefusal | null {
    const text = chatText(raw);
    if (text === null) return 'text';
    const entry = this.shared(id);
    if (entry?.kind !== 'chat' || entry.who !== who) return 'gone';
    if (entry.text === text) return null;
    this.replace({ ...entry, text, edited: this.ports.clock() });
    this.requote(id, text);
    this.ports.changed();
    return null;
  }

  private setReaction(who: string, id: string, emoji: LogReactionEmoji, on: boolean): boolean {
    const entry = this.shared(id);
    if (entry === undefined || (entry.kind !== 'chat' && entry.kind !== 'roll') || !isLogReaction(emoji)) return false;
    const reactions = withReaction(entry.reactions ?? [], emoji, who, on);
    if (reactions === null) return true;
    const { reactions: _before, ...rest } = entry;
    this.replace(reactions.length === 0 ? rest : { ...rest, reactions });
    this.ports.changed();
    return true;
  }

  /** An entry players have, by id: one only the GM has is none of theirs to answer, change or react to. */
  private shared(id: string): GmLogEntry | undefined {
    const entry = this.find(id);
    return entry?.hidden === true ? undefined : entry;
  }

  private find(id: string): GmLogEntry | undefined {
    return this.list.find((entry) => entry.id === id);
  }

  private stamp(who: string, name: string): Pick<LogEntry, 'id' | 'at' | 'who' | 'name'> {
    return { id: this.ports.randomId(), at: this.ports.clock(), who, name };
  }

  private nameOf(who: string): string | null {
    return who === GM_AUTHOR ? GM_NAME : this.names.get(who) ?? this.ports.nameOf(who);
  }

  private add(entry: GmLogEntry): void {
    if (parseLogEntry(sharedEntry(entry)) === null) return;
    // Shared and hidden entries are counted apart: the entries players hold are the newest shared ones, whatever the GM rolled unseen.
    const hidden = entry.hidden === true;
    const same = this.list.filter((other) => (other.hidden === true) === hidden);
    const oldest = same.length >= MAX_LOG_ENTRIES ? same[0] : undefined;
    this.list = [...this.list.filter((other) => other !== oldest), entry];
    if (!hidden) this.ports.send({ t: 'log-entry', entry: sharedEntry(entry) });
    this.ports.changed();
  }

  /** Puts a changed entry in its place and tells the players; the caller says `changed` once. */
  private replace(entry: GmLogEntry): void {
    this.list = this.list.map((other) => (other.id === entry.id ? entry : other));
    if (entry.hidden !== true) this.ports.send({ t: 'log-entry', entry: sharedEntry(entry) });
  }

  /**
   * The answers to the entry `id` quote its new text, or nothing once it was deleted (null). Players
   * are told nothing more: their pages do the same by the same rule (`quoting`), so a message with
   * many answers costs one frame to change, not one for each.
   */
  private requote(id: string, text: string | null): void {
    this.list = this.list.map((other) => (other.kind === 'chat' && other.reply?.id === id ? { ...other, reply: quoting(other.reply, text) } : other));
  }

  private drop(entry: GmLogEntry): void {
    this.list = this.list.filter((other) => other.id !== entry.id);
    if (entry.hidden !== true) this.ports.send({ t: 'log-remove', id: entry.id });
    // Answers keep standing, without what they quoted.
    this.requote(entry.id, null);
    this.ports.changed();
  }

  private refuse(reason: ChatRefusal, to: string): true {
    if (this.refusalRate.take(to, this.ports.now())) this.ports.send({ t: 'chat-refused', reason }, to);
    return true;
  }
}

/** What an answer shows of the entry it answers. */
function replyTo(entry: GmLogEntry): LogReply {
  const preview = entry.kind === 'chat' ? replyPreview(entry.text) : entry.kind === 'roll' ? replyPreview(`${entry.roll.formula} = ${entry.roll.total}`) : '';
  return { id: entry.id, who: entry.who, name: entry.name, preview };
}

/** The most who a reaction names: everyone a table seats and the GM. Past that the earliest gives way (someone who joined anew under another id). */
const MAX_REACTORS = MAX_PLAYERS + 1;

/** The reactions with `who`'s `emoji` given or taken back, in the order reactions are offered; null when nothing changes. */
function withReaction(reactions: readonly LogReaction[], emoji: LogReactionEmoji, who: string, on: boolean): readonly LogReaction[] | null {
  const current = reactions.find((reaction) => reaction.emoji === emoji);
  if ((current?.by.includes(who) ?? false) === on) return null;
  const by = on ? [...(current?.by ?? []), who].slice(-MAX_REACTORS) : (current?.by ?? []).filter((other) => other !== who);
  const others = reactions.filter((reaction) => reaction.emoji !== emoji);
  const next = by.length === 0 ? others : [...others, { emoji, by }];
  return [...next].sort((a, b) => LOG_REACTIONS.indexOf(a.emoji) - LOG_REACTIONS.indexOf(b.emoji));
}
