/**
 * What the panel changes beside its note (spec §5.5, §9.1): clearing a
 * block's values on this statblock (one write to the note), and removing a
 * block from the note's template (one step in the template's session). A
 * built-in is never changed: the block goes from the collection's own copy,
 * made once where it does not exist yet, and this note switches to it. The
 * values stay in the notes either way.
 */

import type { App } from 'obsidian';
import { deleteTemplate } from '../../library/templateActions';
import { forgetOwnCopy, ensureOwnCopy } from '../../library/ownCopy';
import type { TemplateSession } from '../../library/TemplateSession';
import { templateNotes } from '../../library/templateUsage';
import { deleteBlock } from '../../model/coreSlots';
import { fieldsShownBy, findBlock, flattenReadingOrder } from '../../model/treeQueries';
import { isContainerBlock, type StatblockTemplate, type TemplateBlock, type TemplateId } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import { readField, type FieldRecord } from '../../values/fieldValues';
import type { PaneServices } from '../paneServices';
import { templateKeyPatch } from './templateKeyPatch';
import type { TemplateStep } from './panelHistory';
import { sectionAddition, type NewSection } from './sectionChoices';
import { fieldPatches } from './valuePatches';

/** Every block a block stands for: itself, and a container's blocks all the way down. */
function blocksOf(block: TemplateBlock): TemplateBlock[] {
  return isContainerBlock(block) ? [block, ...flattenReadingOrder(block.blocks)] : [block];
}

/** The patches that delete this note's values of every property a block shows. */
export function clearPatches(template: StatblockTemplate, block: TemplateBlock, record: FieldRecord): NotePatch[] {
  const fields = new Map(template.fields.map((field) => [field.key, field]));
  const keys = new Set(blocksOf(block).flatMap((each) => fieldsShownBy(each)));
  return [...keys].flatMap((key) => {
    const field = fields.get(key);
    return field ? fieldPatches(key, readField(record, field), undefined) : [];
  });
}

/** Whether the note holds a value for any property the block shows: what "Clear" would take away. */
export function hasValues(template: StatblockTemplate, block: TemplateBlock, record: FieldRecord): boolean {
  return clearPatches(template, block, record).length > 0;
}

/** The template without the block; the properties it showed stay (their values stay in every note). */
function withoutBlock(template: StatblockTemplate, blockId: string): StatblockTemplate {
  const edit = deleteBlock(template.layout, blockId);
  return edit.ok && edit.layout !== template.layout ? { ...template, layout: edit.layout } : template;
}

export interface TemplateEditInput {
  app: App;
  notePath: string;
  record: FieldRecord;
  collectionId: string | null;
  writer: PaneServices['writer'];
  /** The note's template now. */
  templateId: TemplateId;
  builtIn: boolean;
  /** The panel's own hold on a template's session, opened on first use. */
  hold: (id: TemplateId) => TemplateSession | null;
  /** Lets go of the panel's hold (before a copy made by an undone action is deleted). */
  drop: (id: TemplateId) => void;
}

/** The collection's copy a built-in's change went to: found, or made by this change. */
export interface Copied {
  builtInId: TemplateId;
  copyId: TemplateId;
  made: boolean;
}

export type RemoveResult =
  | { ok: true; step: TemplateStep; copied: Copied | null }
  | { ok: false; problem: string };

/** Switches the note to another template: `atlas-template` alone, no value touched. */
async function switchNote(input: TemplateEditInput, record: FieldRecord, to: TemplateId): Promise<boolean> {
  const outcome = await input.writer.write(input.notePath, [templateKeyPatch(record, to)]);
  return outcome.problem === null && outcome.conflicts.length === 0;
}

/** The template a structural change lands in: the note's own, or for a built-in the collection's copy (made where missing). */
async function landingTemplate(input: TemplateEditInput): Promise<{ id: TemplateId; copied: Copied | null } | { problem: string }> {
  if (!input.builtIn) return { id: input.templateId, copied: null };
  if (!input.collectionId) return { problem: 'Choose a collection for this statblock first: its copy of the template belongs to one.' };
  const copy = await ensureOwnCopy(input.app, input.collectionId, input.templateId);
  if (!(await switchNote(input, input.record, copy.id))) return { problem: 'The copy is there, but this statblock could not switch to it.' };
  return { id: copy.id, copied: { builtInId: input.templateId, copyId: copy.id, made: copy.made } };
}

/** Undoing an action that switched the note to a copy switches it back, and deletes the copy where this action made it and no other note uses it. */
function backToBuiltIn(input: TemplateEditInput, copied: Copied): () => void {
  return () => {
    void (async () => {
      const record = { ...input.record, 'atlas-template': copied.copyId };
      await switchNote(input, record, copied.builtInId);
      const others = templateNotes(input.app, copied.copyId).filter((path) => path !== input.notePath);
      if (!copied.made || others.length > 0 || !input.collectionId) return;
      input.drop(copied.copyId);
      await forgetOwnCopy(input.app, input.collectionId, copied.builtInId, copied.copyId);
      await deleteTemplate(input.app, copied.copyId, null);
    })().catch((error: unknown) => console.error('[Atlas] Taking back the template copy failed:', error));
  };
}

/** A change of the note's template as one step of its session, in the template it lands in. */
async function changeTemplate(
  input: TemplateEditInput,
  check: (template: StatblockTemplate) => string | null,
  edit: (template: StatblockTemplate) => StatblockTemplate,
): Promise<RemoveResult> {
  const landing = await landingTemplate(input);
  if ('problem' in landing) return { ok: false, problem: landing.problem };
  const session = input.hold(landing.id);
  if (!session) return { ok: false, problem: 'The template could not be opened.' };
  const before = session.getSnapshot().template;
  const problem = check(before);
  if (problem) return { ok: false, problem };
  session.apply(edit);
  const after = session.getSnapshot().template;
  if (after === before) return { ok: false, problem: 'This template can\'t be changed here.' };
  const { copied } = landing;
  const step: TemplateStep = {
    current: () => session.getSnapshot().template,
    undo: () => session.undo(),
    redo: () => session.redo(),
    before,
    after,
    ...(copied && {
      undoMore: backToBuiltIn(input, copied),
      // A copy that was there before stays: a redo switches the note to it again.
      redoMore: () => void switchNote(input, input.record, copied.copyId),
      once: copied.made,
    }),
  };
  return { ok: true, step, copied };
}

/** Removes a block from the note's template as one step of its session; the block's id stays the same in a copy. */
export function removeBlockFromTemplate(input: TemplateEditInput, blockId: string): Promise<RemoveResult> {
  return changeTemplate(
    input,
    (template) => (findBlock(template.layout.blocks, blockId) ? null : 'The template no longer has that block.'),
    (template) => withoutBlock(template, blockId),
  );
}

export type AddResult = (RemoveResult & { ok: false }) | (RemoveResult & { ok: true; blockId: string });

/**
 * Adds a section to the note's template (§8.3) as one step of its session,
 * after `after` or in its place among the book's sections. A shared template
 * changes for all its statblocks, which hide the section while it is empty; a
 * built-in's change goes to the collection's own copy.
 */
export async function addSectionToTemplate(input: TemplateEditInput, section: NewSection, after: string | null): Promise<AddResult> {
  let blockId: string | null = null;
  const result = await changeTemplate(input, () => null, (template) => {
    const addition = sectionAddition(template, section, after !== null && findBlock(template.layout.blocks, after) ? after : null);
    blockId = addition?.blockId ?? null;
    return addition?.template ?? template;
  });
  if (!result.ok) return result;
  return blockId ? { ...result, blockId } : { ok: false, problem: `Couldn't add ${section.label}.` };
}
