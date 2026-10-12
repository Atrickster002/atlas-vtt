/**
 * The files of the user's game system presets: one JSON file per preset in a visible folder,
 * so they sync with the vault. The file is named after the preset; the id inside it is the
 * preset's identity, never the path.
 */

import { ATLAS_VTT_DIR } from '../assetPaths';
import { freeNamedPath, isNamedAfterStem, nameStem } from '../recordFiles/recordNames';
import { BUILT_IN_ID_PREFIX } from '../../types/systemPresetTypes';
import { readRecordText, recordText, type StoredRecord } from '../recordFiles/recordLayout';

/** A user preset as stored, with every field a newer Atlas may have added. */
export type StoredPreset = StoredRecord;

export const SYSTEM_PRESET_FOLDER = `${ATLAS_VTT_DIR}/system-presets`;
export const PRESET_FILE_EXTENSION = 'json';
/** The format of a preset file; a later one keeps its own number when this Atlas writes it. */
export const PRESET_FILE_FORMAT = 1;

const FALLBACK_NAME = 'System preset';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `path` is a preset file: a JSON file in the presets folder or a folder below it. */
export function isPresetPath(path: string): boolean {
  return path.startsWith(`${SYSTEM_PRESET_FOLDER}/`) && path.toLowerCase().endsWith(`.${PRESET_FILE_EXTENSION}`);
}

/** Whether `entry` is something a preset file may hold: a record with a user preset's id. */
export function isStoredPreset(entry: unknown): entry is StoredPreset {
  return isRecord(entry) && typeof entry.id === 'string' && entry.id.trim().length > 0 && !entry.id.startsWith(BUILT_IN_ID_PREFIX);
}

/** The preset a file holds, or null when it holds none (not JSON, no id, a built-in's id). */
export function readPresetText(text: string): StoredPreset | null {
  return readRecordText(text, isStoredPreset);
}

/** The file text for a preset: its format first, then the preset as stored. */
export function presetText(entry: StoredPreset): string {
  return recordText(entry, PRESET_FILE_FORMAT);
}

const SUFFIX = `.${PRESET_FILE_EXTENSION}`;

/**
 * `<name>.json` in the presets folder, else `<name> 2.json`, `<name> 3.json`, … while that is
 * taken. `isTaken` answers in any letter case: macOS and Windows do not tell names apart by it.
 */
export function freePresetPath(name: unknown, isTaken: (path: string) => boolean): string {
  return freeNamedPath(SYSTEM_PRESET_FOLDER, nameStem(name, FALLBACK_NAME), SUFFIX, isTaken);
}

/** Whether a file at `path` is named after `name` (`Name.json`, or `Name 2.json` beside another). */
export function isNamedAfter(path: string, name: unknown): boolean {
  return isNamedAfterStem(path, nameStem(name, FALLBACK_NAME), SUFFIX);
}
