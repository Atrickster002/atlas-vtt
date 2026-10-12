import { GM_AUTHOR, isLogReaction, isPlayerLogType, isRecord, MAX_LOG_ENTRIES, parseLogEntry, parsePlayerLog, quoting, type ChatRefusal, type LogEntry, type LogReactionEmoji, type PlayerInfo, type PlayerLogMessage, type RollRequestAnswer, type TablePerson } from '../../protocol/index.ts';
import { MoveRate } from '../moveCheck.ts';
import { chatFields, keepsRolls, rollButton } from './logChat.ts';
import { CHAT_BURST, CHATS_PER_SECOND, GM_NAME, LOG_SNAPSHOT_BYTES, REACT_BURST, REACTS_PER_SECOND, REFUSAL_BURST, REFUSALS_PER_SECOND, type ChatDraft, type LoggedRoll, type RollRequest, type SpokenAs, type TableLogPorts } from './logTypes.ts';
import { entriesWithin, readSavedLog, seesWhole, sharedEntry, speakerArtIn, viewOf, type GmLogEntry, type SavedLog } from './logEntries.ts';
import { publishEntry, retractEntry, sendLog } from './logFanout.ts';
import { LEAVE_GRACE_MS, LogPresence } from './LogPresence.ts';
import { withReaction } from './logReactions.ts';

export { CHAT_BURST, CHATS_PER_SECOND, GM_NAME, LEAVE_GRACE_MS, LOG_SNAPSHOT_BYTES, REACT_BURST, REACTS_PER_SECOND, REFUSAL_BURST, REFUSALS_PER_SECOND };
export type { ChatDraft, LoggedRoll, RollRequest, SpokenAs, TableLogPorts };

/**
 * The table's log, kept by the GM: chat messages, rolls, and who came and went. Players' messages are
 * taken only as checked (shape and text by the protocol's parser, the sender as the relay stamped it,
 * their rate, whom they whisper and as whom they speak, and that what they edit or delete is their
 * own). Every change goes to each player as they may see it (`viewOf`): whispers only to their
 * audience, a private roll whole to the people shown it and as a line that it was made to the rest.
 * Entries only the GM has (`hidden`) are never sent and are counted apart, so nothing players hold
 * tells of them. Nothing is kept that a client would not read (`parseLogEntry`).
 */
export class TableLog {
  private readonly ports: TableLogPorts;
  private list: GmLogEntry[];
  private readonly chatRate = new MoveRate(CHAT_BURST, CHATS_PER_SECOND);
  private readonly reactRate = new MoveRate(REACT_BURST, REACTS_PER_SECOND);
  private readonly refusalRate = new MoveRate(REFUSAL_BURST, REFUSALS_PER_SECOND);
  private readonly presence: LogPresence;
  private readonly listeners = new Set<(entry: LogEntry) => void>();
  /** Messages are taken one after another: one waiting for its speaker's artwork keeps its place, and those after it wait too. */
  private queue: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private disposed = false;

  constructor(ports: TableLogPorts, saved: unknown = undefined) {
    this.ports = ports;
    const kept = readSavedLog(saved);
    this.list = kept.entries;
    // Who was there is kept beside the entries: their lines may have left the log, or the GM cleared it.
    this.presence = new LogPresence({
      nameOf: (player) => ports.nameOf(player),
      setTimer: (run, ms) => ports.setTimer(run, ms),
      clearTimer: (timer) => ports.clearTimer(timer),
      line: (kind, id, name) => void this.add({ ...this.stamp(id, name), kind }),
      changed: () => this.ports.send({ t: 'people', people: this.presence.people() }),
    }, kept.present, this.list);
  }

  /** Every entry, oldest first; the same array while nothing changed. */
  entries(): readonly GmLogEntry[] {
    return this.list;
  }

  /** The log as kept with the table: the newest entries that fit `LOG_SNAPSHOT_BYTES`, and who is counted as there. */
  saved(): SavedLog {
    return { entries: entriesWithin(this.list, LOG_SNAPSHOT_BYTES), present: [...this.presence.players] };
  }

  /** The players at the table, as players are told for whispers. */
  people(): readonly TablePerson[] {
    return this.presence.people();
  }

  /** Hears every entry added, as the GM's log has it; returns the way to stop. */
  listen(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The vault path of a speaker's artwork the log shows, by hash: what its viewers may be sent. */
  speakerArt(hash: string): string | undefined {
    return speakerArtIn(this.list, hash);
  }

  /** The relay's welcome: exactly these players are connected. */
  welcome(players: readonly PlayerInfo[]): void {
    this.presence.welcome(players);
  }

  joined(player: PlayerInfo): void {
    this.presence.joined(player);
  }

  left(id: string): void {
    this.presence.left(id);
  }

  /** A roll made at the table; false where the log could not take it. */
  rolled(roll: LoggedRoll): boolean {
    const name = this.nameOf(roll.who);
    if (name === null) return false;
    return this.add({
      ...this.stamp(roll.who, name), kind: 'roll', roll: roll.roll, token: roll.token,
      ...(!roll.shared && { hidden: true as const }),
      ...(roll.face !== undefined && { face: roll.face }),
      ...(roll.mode !== undefined && roll.to !== undefined && { mode: roll.mode, to: roll.to }),
      ...(roll.flavor !== undefined && { flavor: roll.flavor }),
      ...(roll.speaker !== undefined && { speaker: roll.speaker.speaker }),
      ...(roll.speaker !== undefined && roll.speaker.art !== null && { speakerArt: roll.speaker.art }),
      ...(roll.request !== undefined && { request: roll.request }),
    });
  }

  /** The roll button `index` of a message `viewer` sees whole, or null where there is none. */
  requestOf(viewer: string, answer: RollRequestAnswer): RollRequest | null {
    const entry = this.visible(answer.id, viewer);
    return entry?.kind === 'chat' ? rollButton(entry, answer.index) : null;
  }

  /** The GM says something; the refusal when it is not said. Said at once unless it waits for a speaker's artwork, or after a message that does. */
  say(draft: ChatDraft): Promise<ChatRefusal | null> {
    return Promise.resolve(this.chat(GM_AUTHOR, draft));
  }

  /** The GM changes a message of their own. */
  edit(id: string, text: string): ChatRefusal | null {
    return this.changeText(GM_AUTHOR, id, text);
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

  /** The log to one player (who joined) or to all (the GM is back): the newest entries each may see that fit, and who is at the table. */
  resend(to?: string): void {
    sendLog((body, player) => this.ports.send(body, player), this.presence.players, this.list, LOG_SNAPSHOT_BYTES, to);
    this.ports.send({ t: 'people', people: this.people() }, to);
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
    if (refusal instanceof Promise) void refusal.then((later) => later !== null && this.refuse(later, from));
    else if (refusal !== null) this.refuse(refusal, from);
    return true;
  }

  /** Stops the timers of players who may be back: nothing is written after the table ended. */
  dispose(): void {
    this.disposed = true;
    this.presence.dispose();
  }

  private apply(from: string, message: PlayerLogMessage): ChatRefusal | null | Promise<ChatRefusal | null> {
    if (message.t === 'chat') {
      const { t: _t, ...draft } = message;
      return this.chat(from, draft);
    }
    if (message.t === 'chat-edit') return this.changeText(from, message.id, message.text);
    if (message.t === 'react') return this.setReaction(from, message.id, message.emoji, message.on) ? null : 'gone';
    const entry = this.visible(message.id, from);
    if (entry?.kind !== 'chat' || entry.who !== from) return 'gone';
    this.drop(entry);
    return null;
  }

  /** A message said: at once, or in turn after its speaker's artwork was read. */
  private chat(who: string, draft: ChatDraft): ChatRefusal | null | Promise<ChatRefusal | null> {
    const { speaker } = draft;
    if (speaker === undefined && this.waiting === 0) return this.chatNow(who, draft, null);
    this.waiting += 1;
    const said = this.queue
      .then(() => (speaker === undefined ? null : this.ports.speaker?.(who, speaker) ?? null))
      .then((spoken) => this.chatNow(who, draft, spoken))
      .finally(() => void (this.waiting -= 1));
    this.queue = said.catch(() => undefined);
    return said;
  }

  private chatNow(who: string, draft: ChatDraft, spoken: SpokenAs | null): ChatRefusal | null {
    const fields = chatFields(draft, spoken, {
      who,
      known: (id) => id === GM_AUTHOR || (this.presence.players.has(id) && this.nameOf(id) !== null),
      // A roll only the GM has is no entry an answer quotes: the answer would be seen by others.
      answered: (id) => {
        const entry = this.visible(id, who);
        return entry?.hidden === true ? undefined : entry;
      },
      rollInline: (formula) => this.ports.rollInline?.(formula) ?? null,
    });
    const name = this.nameOf(who);
    if (typeof fields === 'string') return fields;
    if (name === null || this.disposed) return 'text';
    // The GM whispering to themselves writes a note only the GM's log has.
    const note = who === GM_AUTHOR && draft.to?.length === 1 && draft.to[0] === GM_AUTHOR;
    const { to: _to, ...open } = fields;
    return this.add(note ? { ...this.stamp(who, name), kind: 'chat', ...open, hidden: true } : { ...this.stamp(who, name), kind: 'chat', ...fields }) ? null : 'text';
  }

  private changeText(who: string, id: string, text: string): ChatRefusal | null {
    const entry = this.visible(id, who);
    if (entry?.kind !== 'chat' || entry.who !== who) return 'gone';
    if (entry.text === text) return null;
    if (!keepsRolls(entry.text, text)) return 'roll';
    this.replace({ ...entry, text, edited: this.ports.clock() });
    this.requote(id, text);
    this.ports.changed();
    return null;
  }

  private setReaction(who: string, id: string, emoji: LogReactionEmoji, on: boolean): boolean {
    const entry = this.visible(id, who);
    if (entry === undefined || (entry.kind !== 'chat' && entry.kind !== 'roll') || !isLogReaction(emoji)) return false;
    const reactions = withReaction(entry.reactions ?? [], emoji, who, on);
    if (reactions === null) return true;
    const { reactions: _before, ...rest } = entry;
    this.replace(reactions.length === 0 ? rest : { ...rest, reactions });
    this.ports.changed();
    return true;
  }

  /** An entry `viewer` sees whole, by id: one they see only a line of, or not at all, is none of theirs to answer, change or react to. */
  private visible(id: string, viewer: string): GmLogEntry | undefined {
    const entry = this.find(id);
    if (entry === undefined || (entry.hidden === true && viewer !== GM_AUTHOR)) return undefined;
    return seesWhole(entry, viewer) ? entry : undefined;
  }

  private find(id: string): GmLogEntry | undefined {
    return this.list.find((entry) => entry.id === id);
  }

  private stamp(who: string, name: string): Pick<LogEntry, 'id' | 'at' | 'who' | 'name'> {
    return { id: this.ports.randomId(), at: this.ports.clock(), who, name };
  }

  private nameOf(who: string): string | null {
    return who === GM_AUTHOR ? GM_NAME : this.presence.nameOf(who);
  }

  /** Takes an entry in; false for one a client would not read, which is never kept. */
  private add(entry: GmLogEntry): boolean {
    if (parseLogEntry(sharedEntry(entry)) === null) return false;
    // Shared and hidden entries are counted apart: the entries players hold are the newest shared ones, whatever the GM rolled unseen.
    const hidden = entry.hidden === true;
    const same = this.list.filter((other) => (other.hidden === true) === hidden);
    const oldest = same.length >= MAX_LOG_ENTRIES ? same[0] : undefined;
    this.list = [...this.list.filter((other) => other !== oldest), entry];
    publishEntry((body, to) => this.ports.send(body, to), this.presence.players, entry);
    const shown = viewOf(entry, GM_AUTHOR);
    if (shown !== null) for (const listener of [...this.listeners]) listener(shown);
    this.ports.changed();
    return true;
  }

  /** Puts a changed entry in its place and tells the players; the caller says `changed` once. */
  private replace(entry: GmLogEntry): void {
    this.list = this.list.map((other) => (other.id === entry.id ? entry : other));
    publishEntry((body, to) => this.ports.send(body, to), this.presence.players, entry);
  }

  /**
   * The answers to the entry `id` quote its new text, or nothing once it was deleted (null). Players
   * are told nothing more: their pages do the same by the same rule (`quoting`), so a message with
   * many answers costs one frame to change, not one for each. An answer to a whisper is a whisper to
   * the same people, so the quote reaches only those who were shown what it quotes.
   */
  private requote(id: string, text: string | null): void {
    this.list = this.list.map((other) => (other.kind === 'chat' && other.reply?.id === id ? { ...other, reply: quoting(other.reply, text) } : other));
  }

  private drop(entry: GmLogEntry): void {
    this.list = this.list.filter((other) => other.id !== entry.id);
    retractEntry((body, to) => this.ports.send(body, to), this.presence.players, entry);
    // Answers keep standing, without what they quoted.
    this.requote(entry.id, null);
    this.ports.changed();
  }

  private refuse(reason: ChatRefusal, to: string): true {
    if (this.refusalRate.take(to, this.ports.now())) this.ports.send({ t: 'chat-refused', reason }, to);
    return true;
  }
}

