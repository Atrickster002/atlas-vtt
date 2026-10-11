import { GM_AUTHOR, type LogEntry, type LogReactionEmoji } from '../protocol/index.ts';

/** Rows of one author this close together read as one message block. */
const GROUP_WINDOW_MS = 7 * 60_000;

/**
 * Whether a row continues the one above it: the same author's chat message within seven minutes,
 * and no reply. Such a row drops its avatar and byline.
 */
export function continuesPrevious(prev: LogEntry | undefined, cur: LogEntry): boolean {
  if (prev === undefined || prev.kind !== 'chat' || cur.kind !== 'chat') return false;
  if (prev.who !== cur.who || cur.reply !== undefined) return false;
  return Math.abs(cur.at - prev.at) < GROUP_WINDOW_MS;
}

/** One reaction of an entry as a chip shows it. */
export interface ShownReaction {
  readonly emoji: LogReactionEmoji;
  readonly count: number;
  /** The viewer gave it. */
  readonly mine: boolean;
}

/** The reactions of an entry, in the order they were first given; none for a line about who came or left. */
export function reactionsFor(entry: LogEntry, self: string | null): readonly ShownReaction[] {
  if (entry.kind !== 'chat' && entry.kind !== 'roll') return [];
  return (entry.reactions ?? [])
    .filter((reaction) => reaction.by.length > 0)
    .map((reaction) => ({ emoji: reaction.emoji, count: reaction.by.length, mine: self !== null && reaction.by.includes(self) }));
}

/** Obsidian's colour variables a player's colour is picked from. */
export const AUTHOR_COLOURS = ['--color-red', '--color-orange', '--color-yellow', '--color-green', '--color-cyan', '--color-blue', '--color-purple', '--color-pink'] as const;
/** The GM's colour. */
export const GM_COLOUR = '--interactive-accent';

/** Which of `AUTHOR_COLOURS` an author has (`'gm'` for the GM): a sum over the id's characters, so it never changes. */
export function authorTone(who: string): number | 'gm' {
  if (who === GM_AUTHOR) return 'gm';
  let sum = 0;
  for (const char of who) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return sum % AUTHOR_COLOURS.length;
}

/** The CSS variable that holds an author's colour. */
export function authorColour(who: string): string {
  const tone = authorTone(who);
  return tone === 'gm' ? GM_COLOUR : AUTHOR_COLOURS[tone] ?? GM_COLOUR;
}

/** The letter on an author's disc: the first character of the name, in upper case. */
export function monogram(name: string): string {
  const [first] = name.trim();
  return first === undefined ? '?' : first.toLocaleUpperCase();
}

/** An author's name as the viewer reads it: "You" for their own, "GM" for the GM's. */
export function shownName(who: string, name: string, self: string | null): string {
  if (self !== null && who === self) return 'You';
  return who === GM_AUTHOR ? 'GM' : name;
}
