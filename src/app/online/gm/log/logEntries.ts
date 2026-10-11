import { isRecord, MAX_LOG_ENTRIES, MAX_PLAYERS, parseLogEntry, PLAYER_ID_PATTERN, type LogEntry } from '../../protocol/index.ts';
import type { TokenEntity } from '../../../types';
import type { DiceRollResult } from '../../../types/diceTypes';

/** The longest token name and artwork path the GM's log keeps with a roll. */
const MAX_FACE_TEXT = 1000;

/** The token a roll was made for, as the GM's own log names it: its name and its artwork in the vault. */
export interface RollFace {
  readonly name: string;
  readonly image: string | null;
}

/** The token Atlas made a roll for, as the roll names it: its name, and the artwork the roll or the token on the map has. */
export function rollFaceOf(source: DiceRollResult['source'], tokens: Readonly<Record<string, TokenEntity>>): { readonly face?: RollFace } {
  const name = source?.tokenName;
  if (source === undefined || name === undefined || name === '') return {};
  const image = source.tokenImagePath ?? (source.tokenId === undefined ? undefined : tokens[source.tokenId]?.imagePath);
  return { face: { name: name.slice(0, MAX_FACE_TEXT), image: image === undefined || image === '' || image.length > MAX_FACE_TEXT ? null : image } };
}

/**
 * An entry as the GM keeps it: what players are sent, and beside it what only the GM's log has.
 * `hidden`: players never get the entry (a GM's roll they are not shown). `face`: the roll's token.
 */
export type GmLogEntry = LogEntry & { readonly hidden?: true; readonly face?: RollFace };

/** The token the GM's log names for an entry, when it holds one. */
export function faceOf(entry: LogEntry): RollFace | undefined {
  return (entry as GmLogEntry).face;
}

/** An entry as players are sent it: without what only the GM's log has. */
export function sharedEntry(entry: GmLogEntry): LogEntry {
  const { hidden: _hidden, face: _face, ...shared } = entry;
  return shared;
}

const encoder = new TextEncoder();

/** The newest entries whose JSON fits `bytes` together, oldest first. */
export function entriesWithin<Entry extends LogEntry>(entries: readonly Entry[], bytes: number): Entry[] {
  let left = bytes;
  let from = entries.length;
  while (from > 0) {
    left -= encoder.encode(JSON.stringify(entries[from - 1])).length + 1;
    if (left < 0) break;
    from -= 1;
  }
  return entries.slice(from);
}

function readFace(value: unknown): RollFace | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name === '' || value.name.length > MAX_FACE_TEXT) return undefined;
  const image = typeof value.image === 'string' && value.image !== '' && value.image.length <= MAX_FACE_TEXT ? value.image : null;
  return { name: value.name, image };
}

/** The log as kept with a table: its entries, and the players it counts as there (a line said they joined, none yet that they left). */
export interface SavedLog {
  readonly entries: readonly GmLogEntry[];
  readonly present: readonly string[];
}

/** The log as kept with a table, each part checked; what cannot be read is left out. */
export function readSavedLog(saved: unknown): { entries: GmLogEntry[]; present: string[] } {
  if (!isRecord(saved)) return { entries: [], present: [] };
  const present = Array.isArray(saved.present) ? saved.present.filter((id): id is string => typeof id === 'string' && PLAYER_ID_PATTERN.test(id)) : [];
  return { entries: readLogEntries(saved.entries), present: [...new Set(present)].slice(0, MAX_PLAYERS * 4) };
}

/** Entries as kept with a table, each checked as a client checks it; what cannot be read is left out. */
function readLogEntries(saved: unknown): GmLogEntry[] {
  if (!Array.isArray(saved)) return [];
  const entries: GmLogEntry[] = [];
  // Twice the log's size: the shared entries and those only the GM has are counted apart.
  for (const value of saved.slice(-2 * MAX_LOG_ENTRIES)) {
    const entry = parseLogEntry(value);
    if (entry === null || !isRecord(value)) continue;
    const face = entry.kind === 'roll' ? readFace(value.face) : undefined;
    entries.push({ ...entry, ...(value.hidden === true && { hidden: true as const }), ...(face !== undefined && { face }) });
  }
  return entries;
}
