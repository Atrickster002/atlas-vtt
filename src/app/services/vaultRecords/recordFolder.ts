/**
 * A folder of library records: one JSON file per record in a visible folder,
 * so they sync with the vault (the user's system presets, the dice sets). A
 * file is named after its record; the id inside it is the record's identity,
 * never the path.
 */

import { normalizePath } from 'obsidian';
import { INVALID_NAME_CHARACTERS } from '../assetPaths';

/** A record as stored, with every field a newer Atlas may have added. */
export type StoredRecord = Record<string, unknown> & { id: string };

/** What tells one folder of records from another. */
export interface RecordFolderSpec {
  folder: string;
  /** The current file format; a record of a later one keeps its number when this Atlas writes it. */
  format: number;
  /** The file name of a record without a usable name. */
  fallbackName: string;
  /** Ids the folder may not hold (a built-in's prefix). */
  reservedIdPrefix: string;
  /** Names the kind of record in log messages: "system preset". */
  noun: string;
}

/** Where a folder's records are kept: its vault files (`RecordFolderFiles`), or memory in tests. */
export interface RecordStorage {
  /** The records as stored, unvalidated; the same array while nothing changed. */
  entries(): readonly StoredRecord[];
  create(entry: StoredRecord): void;
  /** Changes the stored record `id` with `change`, which gets the record as stored. */
  update(id: string, change: (stored: StoredRecord) => StoredRecord): void;
  remove(id: string): void;
  /** Calls `listener` after every change, also one that arrived from another device. */
  onChange(listener: () => void): () => void;
}

const EXTENSION = 'json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `path` is a record file of `spec`: a JSON file in its folder or a folder below it. */
export function isRecordPath(spec: Pick<RecordFolderSpec, 'folder'>, path: string): boolean {
  return path.startsWith(`${spec.folder}/`) && path.toLowerCase().endsWith(`.${EXTENSION}`);
}

/** Whether `path` is `folder` or lies inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Whether `entry` is something a record file may hold: a record with an id the folder allows. */
export function isStoredRecord(spec: Pick<RecordFolderSpec, 'reservedIdPrefix'>, entry: unknown): entry is StoredRecord {
  return isRecord(entry) && typeof entry.id === 'string' && entry.id.trim().length > 0 && !entry.id.startsWith(spec.reservedIdPrefix);
}

/** The record a file holds, or null when it holds none (not JSON, no id, a reserved id). */
export function readRecordText(spec: Pick<RecordFolderSpec, 'reservedIdPrefix'>, text: string): StoredRecord | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isStoredRecord(spec, parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The file text for a record: its format first, then the record as stored. */
export function recordText(spec: Pick<RecordFolderSpec, 'format'>, entry: StoredRecord): string {
  const format = typeof entry.format === 'number' && entry.format > spec.format ? entry.format : spec.format;
  // Assigned twice, so the format leads the file and an older number is replaced.
  return `${JSON.stringify(Object.assign({ format }, entry, { format }), null, 2)}\n`;
}

/** A name a file can carry: characters Obsidian rejects or that break links become `-`. */
function fileStem(spec: Pick<RecordFolderSpec, 'fallbackName'>, name: unknown): string {
  const text = typeof name === 'string' ? name : '';
  const cleaned = text.trim().replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim();
  return cleaned || spec.fallbackName;
}

const pathIn = (folder: string, stem: string): string => normalizePath(`${folder}/${stem}.${EXTENSION}`);

/**
 * `<name>.json` in the folder, else `<name> 2.json`, `<name> 3.json`, … while that is
 * taken. `isTaken` answers in any letter case: macOS and Windows do not tell names apart by it.
 */
export function freeRecordPath(spec: Pick<RecordFolderSpec, 'folder' | 'fallbackName'>, name: unknown, isTaken: (path: string) => boolean): string {
  const stem = fileStem(spec, name);
  let path = pathIn(spec.folder, stem);
  for (let n = 2; isTaken(path); n++) path = pathIn(spec.folder, `${stem} ${n}`);
  return path;
}

/** Whether a file at `path` is named after `name` (`Name.json`, or `Name 2.json` beside another). */
export function isNamedAfter(spec: Pick<RecordFolderSpec, 'fallbackName'>, path: string, name: unknown): boolean {
  const stem = fileStem(spec, name);
  const base = path.slice(path.lastIndexOf('/') + 1, -(EXTENSION.length + 1));
  return base === stem || new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`).test(base);
}
