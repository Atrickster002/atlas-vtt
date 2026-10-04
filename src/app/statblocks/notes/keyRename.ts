/**
 * Moving a renamed key's values in the notes (§4.8, §8.8): one `renameKey` patch per note
 * through `NoteFieldWriter`, each note's backend chosen as it is written, with progress and
 * Cancel. The template keeps the old keys as former keys, so a note the batch has not reached
 * reads as before: a batch cut short, run twice or overtaken by edits leaves every note readable.
 *
 * Each note moves the value its template reads now (the current key, else the newest former key
 * it holds) to the new key, and only while it still names the template. A note that already
 * holds the new key keeps it: an equal old value is dropped, a different one stays where it is.
 */

import type { App } from 'obsidian';
import type { FieldKey, TemplateId } from '../model/templateTypes';
import type { FrontmatterModel } from './yamlDocument';
import { NoteFieldWriter, type WriteOutcome } from './NoteFieldWriter';
import { eachNote, type NoteBatchOptions } from './noteBatch';
import type { NotePatch } from './patchTypes';
import { TEMPLATE_KEY } from './statblockSource';

export interface KeyRename {
  /** The template the notes were listed with; a note that names another is left alone. */
  templateId: TemplateId;
  /** The keys the field had before the rename, newest first: its key, then its former keys. */
  from: readonly FieldKey[];
  to: FieldKey;
}

export type KeyRenameOptions = NoteBatchOptions;

export interface KeyRenameResult {
  /** Notes whose value moved to the new key. */
  renamed: string[];
  /** Notes that held nothing under the old keys, or already held it under the new one only. */
  unchanged: string[];
  /** Notes left as they were, with why; they read through the former key until they are next edited. */
  skipped: Array<{ path: string; reason: string }>;
  /** Notes a cancel kept from being reached. */
  notReached: string[];
}

/** What a note held when the write found it. */
type Found = { kind: 'other-template' | 'nothing' } | { kind: 'old'; key: FieldKey; alsoNew: boolean };

function holds(frontmatter: FrontmatterModel, key: FieldKey): boolean {
  return Object.hasOwn(frontmatter, key) && frontmatter[key] !== undefined;
}

/** Reads the note as the write finds it, notes what it held in `found`, and builds the patch. */
function patchBuilder(rename: KeyRename, found: { value: Found }): (frontmatter: FrontmatterModel | null) => NotePatch[] {
  return (frontmatter) => {
    if (frontmatter?.[TEMPLATE_KEY] !== rename.templateId) {
      found.value = { kind: 'other-template' };
      return [];
    }
    const key = rename.from.find((candidate) => candidate !== rename.to && holds(frontmatter, candidate));
    if (key === undefined) {
      found.value = { kind: 'nothing' };
      return [];
    }
    found.value = { kind: 'old', key, alsoNew: holds(frontmatter, rename.to) };
    return [{ op: 'renameKey', from: key, to: rename.to }];
  };
}

function outcomeOf(path: string, outcome: WriteOutcome, found: Found, to: FieldKey, result: KeyRenameResult): void {
  if (outcome.problem !== null) result.skipped.push({ path, reason: outcome.problem });
  else if (found.kind === 'other-template') result.skipped.push({ path, reason: 'Its template was changed meanwhile.' });
  else if (found.kind !== 'old') result.unchanged.push(path);
  else if (outcome.applied.length > 0) result.renamed.push(path);
  else if (found.alsoNew) result.skipped.push({ path, reason: `It holds different values under “${found.key}” and “${to}”.` });
  else result.skipped.push({ path, reason: 'Its properties could not be rewritten.' });
}

/** Moves each note's value to the new key, one note after another; never throws for a note. */
export async function renameKeyInNotes(
  app: App,
  notes: readonly string[],
  rename: KeyRename,
  options: KeyRenameOptions = {},
): Promise<KeyRenameResult> {
  const writer = NoteFieldWriter.forApp(app);
  const result: KeyRenameResult = { renamed: [], unchanged: [], skipped: [], notReached: [] };
  result.notReached = await eachNote(notes, async (path) => {
    // Set by the builder; a note it never reached (unreadable, gone) reports a problem instead.
    const found: { value: Found } = { value: { kind: 'nothing' } };
    const outcome = await writer.patchNow(path, patchBuilder(rename, found));
    // Saves the editor the patch went into, as a batch's other writes are saved.
    await writer.flush(path);
    outcomeOf(path, outcome, found.value, rename.to, result);
  }, options);
  return result;
}
