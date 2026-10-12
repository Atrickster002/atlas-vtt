import { chatText, GM_AUTHOR, inlineMarks, replyPreview, rolledFormulas, type ChatRefusal, type ChatStyle, type LogReply, type LogSpeaker, type SharedRoll } from '../../protocol/index.ts';
import { rollableFormula } from '../PlayerRolls.ts';
import type { GmLogEntry } from './logEntries.ts';

/** A message as its author wrote it: answering `reply`, in a style, as a token (`speaker`: its key for the author), whispered to `to`. */
export interface ChatDraft {
  readonly text: string;
  readonly reply?: string;
  readonly style?: ChatStyle;
  readonly speaker?: string;
  readonly to?: readonly string[];
}

/** A token an author may speak as: as its viewers know it, and its artwork's vault path. */
export interface SpokenAs {
  readonly speaker: LogSpeaker;
  readonly art: string | null;
}

/** What a message is checked against, for its author. */
export interface ChatContext {
  readonly who: string;
  /** Whether someone may be whispered to: the GM, or a player the log knows by name. */
  known(id: string): boolean;
  /** An entry the author sees whole, by id. */
  answered(id: string): GmLogEntry | undefined;
  /** A formula rolled now by the shared map's rules, or null where it does not roll. */
  rollInline(formula: string): SharedRoll | null;
}

/** What a chat entry holds beyond its stamp. */
export type ChatFields = Pick<Extract<GmLogEntry, { kind: 'chat' }>, 'text' | 'reply' | 'style' | 'speaker' | 'to' | 'inline' | 'speakerArt'>;

/** Everyone an entry is for: its author and its audience; null for an entry everyone sees. */
export function audienceOf(entry: GmLogEntry): readonly string[] | null {
  if ((entry.kind !== 'chat' && entry.kind !== 'roll') || entry.to === undefined) return null;
  return [...new Set([entry.who, ...entry.to])];
}

/** What an answer shows of the entry it answers. */
export function replyTo(entry: GmLogEntry): LogReply {
  const preview = entry.kind === 'chat' ? replyPreview(entry.text) : entry.kind === 'roll' ? replyPreview(`${entry.roll.formula} = ${entry.roll.total}`) : '';
  return { id: entry.id, who: entry.who, name: entry.name, preview };
}

/**
 * Whom a message goes to: an answer to a whisper or a private roll goes to the people that one is
 * for, whatever else was asked, so a quote never reaches someone who was not shown what it quotes;
 * otherwise the people asked for. The author is never among them, and a player's whisper always
 * reaches the GM, who holds the log. Null where someone asked for is unknown or nobody is left.
 */
function audience(draft: ChatDraft, answered: GmLogEntry | undefined, context: ChatContext): readonly string[] | null | undefined {
  const inherited = answered === undefined ? null : audienceOf(answered);
  const asked = inherited ?? draft.to;
  if (asked === undefined) return undefined;
  if (inherited === null && !asked.every((id) => context.known(id))) return null;
  const to = new Set(asked.filter((id) => id !== context.who));
  if (context.who !== GM_AUTHOR) to.add(GM_AUTHOR);
  return to.size === 0 ? null : [...to];
}

/** The rolls a text holds checked, and those it rolls now rolled; null when one does not roll. */
function inlineRolls(text: string, context: ChatContext): readonly SharedRoll[] | null {
  const marks = inlineMarks(text);
  if (marks === null || marks.some((mark) => !rollableFormula(mark.formula))) return null;
  const rolled: SharedRoll[] = [];
  for (const mark of marks) {
    if (mark.mode !== null) continue;
    const roll = context.rollInline(mark.formula);
    if (roll === null) return null;
    rolled.push(roll);
  }
  return rolled;
}

/**
 * A message as the log takes it, or why not: its text cleaned, its answer quoted, its audience
 * checked and its inline rolls rolled, said as `spoken` (the token its speaker key names, looked up
 * before; null where it names none). In character needs a token to speak as; without one the
 * message is said out of character.
 */
export function chatFields(draft: ChatDraft, spoken: SpokenAs | null, context: ChatContext): ChatFields | ChatRefusal {
  const text = chatText(draft.text);
  if (text === null) return 'text';
  // An answer to an entry that is gone by now is still said, as a message of its own.
  const answered = draft.reply === undefined ? undefined : context.answered(draft.reply);
  const to = audience(draft, answered, context);
  if (to === null) return 'whisper';
  const inline = inlineRolls(text, context);
  if (inline === null) return 'roll';
  if (draft.speaker !== undefined && spoken === null) return 'speaker';
  const style = draft.style === 'emote' || (draft.style === 'ic' && spoken !== null) ? draft.style : undefined;
  return {
    text,
    ...(answered !== undefined && { reply: replyTo(answered) }),
    ...(style !== undefined && { style }),
    ...(spoken !== null && { speaker: spoken.speaker }),
    ...(spoken !== null && spoken.art !== null && { speakerArt: spoken.art }),
    ...(to !== undefined && { to }),
    ...(inline.length > 0 && { inline }),
  };
}

/** Whether a new text of a message keeps its rolls: the same rolled formulas in order, and buttons that roll. */
export function keepsRolls(before: string, after: string): boolean {
  const rolled = rolledFormulas(before);
  const now = rolledFormulas(after);
  if (rolled === null || now === null || rolled.length !== now.length || rolled.some((formula, i) => formula !== now[i])) return false;
  return (inlineMarks(after) ?? []).every((mark) => rollableFormula(mark.formula));
}
