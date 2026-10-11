import { parseSharedRoll, type SharedRoll } from './dice.ts';
import { MAX_PLAYERS, PLAYER_ID_PATTERN, playerName, SHOWN, UNSEEN, UNSHOWN } from './relay.ts';
import { isRecord } from './shape.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';

/** The reactions an entry of the log takes, in the order they are offered: the first three at once, the rest behind "more". */
export const LOG_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👎'] as const;
export type LogReactionEmoji = (typeof LOG_REACTIONS)[number];

/** The longest chat message, in characters, and the most lines it keeps. */
export const MAX_CHAT_TEXT = 500;
export const MAX_CHAT_LINES = 12;
/** The entries the GM keeps and a log message holds. */
export const MAX_LOG_ENTRIES = 200;
/** The longest quote a reply carries of what it answers. */
export const MAX_REPLY_PREVIEW = 120;
/** An entry's id: made by the GM, 96 random bits in hex. */
export const LOG_ID_PATTERN = /^[0-9a-f]{24}$/;
/** Who a log entry is by: the GM. */
export const GM_AUTHOR = 'gm';

/** One reaction on an entry and who gave it (`'gm'` or relay ids), in the order they did. */
export interface LogReaction {
  readonly emoji: LogReactionEmoji;
  readonly by: readonly string[];
}

/** What a reply shows of the entry it answers; `gone` once that entry was deleted (its quote is empty then). */
export interface LogReply {
  readonly id: string;
  readonly who: string;
  readonly name: string;
  readonly preview: string;
  readonly gone?: true;
}

interface EntryBase {
  readonly id: string;
  /** When it happened, by the GM's clock (milliseconds). */
  readonly at: number;
  /** Who it is by or about: `'gm'` or a player's relay id, and their name then, shown as text only. */
  readonly who: string;
  readonly name: string;
}

/** A chat message: text shown as text only, `edited` (the GM's clock) once it was changed. */
export interface ChatEntry extends EntryBase {
  readonly kind: 'chat';
  readonly text: string;
  readonly reply?: LogReply;
  readonly edited?: number;
  readonly reactions?: readonly LogReaction[];
}

/** A roll, naming its token (by the id players know it by) when the players see it. */
export interface RollEntry extends EntryBase {
  readonly kind: 'roll';
  readonly roll: SharedRoll;
  readonly token: string | null;
  readonly reactions?: readonly LogReaction[];
}

/** A player came to the table or left it. */
export interface PresenceEntry extends EntryBase {
  readonly kind: 'joined' | 'left';
}

export type LogEntry = ChatEntry | RollEntry | PresenceEntry;

/** Why the GM did not take a player's chat message, edit, deletion or reaction. */
export type ChatRefusal = 'rate' | 'text' | 'gone';

/**
 * The table's log as the GM tells it: all of it (`log`, to a player who joined and after the GM cleared
 * it), one entry added or changed (`log-entry`, by its id), one removed, and to a sender alone that
 * what they sent was not taken. A changed or removed message says nothing of the answers that quote
 * it: whoever holds them quotes the new text, or none (`quoting`), by the same rule.
 */
export type LogMessage =
  | { readonly t: 'log'; readonly entries: readonly LogEntry[] }
  | { readonly t: 'log-entry'; readonly entry: LogEntry }
  | { readonly t: 'log-remove'; readonly id: string }
  | { readonly t: 'chat-refused'; readonly reason: ChatRefusal };

/**
 * What a player sends to the log: a message (answering the entry `reply`), a new text for or the
 * deletion of a message of their own, and a reaction given (`on`) or taken back.
 */
export type PlayerLogMessage =
  | { readonly t: 'chat'; readonly text: string; readonly reply?: string }
  | { readonly t: 'chat-edit'; readonly id: string; readonly text: string }
  | { readonly t: 'chat-delete'; readonly id: string }
  | { readonly t: 'react'; readonly id: string; readonly emoji: LogReactionEmoji; readonly on: boolean };

const REFUSALS: readonly string[] = ['rate', 'text', 'gone'];
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;

const isLogId = (value: unknown): value is string => typeof value === 'string' && LOG_ID_PATTERN.test(value);
const isAuthor = (value: unknown): value is string => value === GM_AUTHOR || (typeof value === 'string' && PLAYER_ID_PATTERN.test(value));
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Whether an emoji is one of the log's reactions. */
export function isLogReaction(value: unknown): value is LogReactionEmoji {
  return typeof value === 'string' && (LOG_REACTIONS as readonly string[]).includes(value);
}

/**
 * A chat message as shown: each line cleaned as a name is (controls and direction marks removed,
 * white space collapsed), blank lines at most one in a row, at most `MAX_CHAT_LINES` lines (the rest
 * joins the last); null when nothing that shows or too much is left.
 */
export function chatText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_CHAT_TEXT * 4) return null;
  const lines = value.split(LINE_BREAK).map((line) => line.replace(UNSHOWN, ' ').replace(UNSEEN, '').replace(/\s+/g, ' ').trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (line === '' && (kept.length === 0 || kept[kept.length - 1] === '')) continue;
    if (kept.length < MAX_CHAT_LINES) kept.push(line);
    else if (line !== '') kept[kept.length - 1] = `${kept[kept.length - 1]} ${line}`.trim();
  }
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  const text = kept.join('\n');
  return SHOWN.test(text) && [...text].length <= MAX_CHAT_TEXT ? text : null;
}

/** A reply as it stands once the entry it answers changed its text (`text`) or was deleted (null). */
export function quoting(reply: LogReply, text: string | null): LogReply {
  const { id, who, name } = reply;
  return text === null ? { id, who, name, preview: '', gone: true } : { id, who, name, preview: replyPreview(text) };
}

/** The one line a reply quotes of a text: its first `MAX_REPLY_PREVIEW` characters, line breaks as spaces. */
export function replyPreview(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const characters = [...line];
  return characters.length <= MAX_REPLY_PREVIEW ? line : `${characters.slice(0, MAX_REPLY_PREVIEW - 1).join('')}…`;
}

function parseReactions(value: unknown): readonly LogReaction[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > LOG_REACTIONS.length) return null;
  const seen = new Set<string>();
  const reactions: LogReaction[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isLogReaction(item.emoji) || seen.has(item.emoji)) return null;
    const { by } = item;
    if (!Array.isArray(by) || by.length === 0 || by.length > MAX_PLAYERS + 1 || !by.every(isAuthor) || new Set(by).size !== by.length) return null;
    seen.add(item.emoji);
    reactions.push({ emoji: item.emoji, by });
  }
  return reactions.length === 0 ? undefined : reactions;
}

function parseReply(value: unknown): LogReply | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isLogId(value.id) || !isAuthor(value.who)) return null;
  const name = playerName(value.name);
  if (name === null || typeof value.preview !== 'string' || [...value.preview].length > MAX_REPLY_PREVIEW) return null;
  if (value.gone !== undefined && value.gone !== true) return null;
  const preview = value.preview.replace(UNSHOWN, ' ').replace(UNSEEN, '');
  return { id: value.id, who: value.who, name, preview, ...(value.gone === true && { gone: true as const }) };
}

/** A log entry as the client reads it, or null for anything malformed: nothing else reaches the panel. */
export function parseLogEntry(value: unknown): LogEntry | null {
  if (!isRecord(value) || !isLogId(value.id) || !isTime(value.at) || !isAuthor(value.who)) return null;
  const name = playerName(value.name);
  if (name === null) return null;
  const base = { id: value.id, at: value.at, who: value.who, name };
  if (value.kind === 'joined' || value.kind === 'left') return value.who === GM_AUTHOR ? null : { ...base, kind: value.kind };
  const reactions = parseReactions(value.reactions);
  if (reactions === null) return null;
  if (value.kind === 'roll') {
    const roll = parseSharedRoll(value.roll);
    if (roll === null || (value.token !== null && (typeof value.token !== 'string' || !TOKEN_ID_PATTERN.test(value.token)))) return null;
    return { ...base, kind: 'roll', roll, token: value.token, ...(reactions !== undefined && { reactions }) };
  }
  if (value.kind !== 'chat') return null;
  const text = chatText(value.text);
  const reply = parseReply(value.reply);
  if (text === null || text !== value.text || reply === null) return null;
  if (value.edited !== undefined && !isTime(value.edited)) return null;
  return {
    ...base, kind: 'chat', text,
    ...(reply !== undefined && { reply }),
    ...(value.edited !== undefined && { edited: value.edited }),
    ...(reactions !== undefined && { reactions }),
  };
}

/** A message about the log as the client reads it, or null for anything malformed. */
export function parseLogMessage(value: Record<string, unknown>): LogMessage | null {
  switch (value.t) {
    case 'log': {
      if (!Array.isArray(value.entries) || value.entries.length > MAX_LOG_ENTRIES) return null;
      // An entry this client cannot read (a newer GM's, a character its tables do not know) is left out: the rest of the log still shows.
      return { t: 'log', entries: value.entries.map(parseLogEntry).filter((entry) => entry !== null) };
    }
    case 'log-entry': {
      const entry = parseLogEntry(value.entry);
      return entry === null ? null : { t: 'log-entry', entry };
    }
    case 'log-remove':
      return isLogId(value.id) ? { t: 'log-remove', id: value.id } : null;
    case 'chat-refused':
      return typeof value.reason === 'string' && REFUSALS.includes(value.reason) ? { t: 'chat-refused', reason: value.reason as ChatRefusal } : null;
    default:
      return null;
  }
}

/** Whether a player message's type is one of the log's. */
export function isPlayerLogType(t: unknown): t is PlayerLogMessage['t'] {
  return t === 'chat' || t === 'chat-edit' || t === 'chat-delete' || t === 'react';
}

/**
 * What a player sent to the log as the GM reads it, or null for anything malformed. A text is taken
 * as cleaned (`chatText`): the GM never shows or sends on what a player typed as it came.
 */
export function parsePlayerLog(value: Record<string, unknown>): PlayerLogMessage | null {
  if (value.t === 'chat') {
    const text = chatText(value.text);
    if (text === null || (value.reply !== undefined && !isLogId(value.reply))) return null;
    return value.reply === undefined ? { t: 'chat', text } : { t: 'chat', text, reply: value.reply };
  }
  if (!isLogId(value.id)) return null;
  if (value.t === 'chat-delete') return { t: 'chat-delete', id: value.id };
  if (value.t === 'chat-edit') {
    const text = chatText(value.text);
    return text === null ? null : { t: 'chat-edit', id: value.id, text };
  }
  if (value.t === 'react') return isLogReaction(value.emoji) && typeof value.on === 'boolean' ? { t: 'react', id: value.id, emoji: value.emoji, on: value.on } : null;
  return null;
}
