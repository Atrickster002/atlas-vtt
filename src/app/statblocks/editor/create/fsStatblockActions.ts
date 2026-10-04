/**
 * Fantasy Statblocks' statblocks as Atlas offers to take them over (§6.4),
 * from the file menu and the command palette: "Edit with an Atlas template…"
 * gives a frontmatter statblock an Atlas template (`atlas-template` alone;
 * `layout:` and every value stay), "Copy into a new statblock" copies a
 * ```statblock fence into a new native note. The note then opens with its
 * statblock beside it.
 */

import { Menu, Notice, type App, type TFile } from 'obsidian';
import { isFantasyStatblocksAvailable } from '../../../services/FantasyStatblocksService';
import { runInBackground } from '../../../utils/backgroundTask';
import { findImportedTemplate, identityOf, importFsLayout } from '../../fs/fsImport';
import { noteFsLayout, noteLayout } from '../../fs/fsLayoutNotes';
import type { FsLayout } from '../../fs/fsLayoutTypes';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import type { TemplateId } from '../../model/templateTypes';
import { NoteFieldWriter } from '../../notes/NoteFieldWriter';
import { cachedFrontmatter, frontmatterSource, statblockSourceOf, type FrontmatterRecord } from '../../notes/statblockSource';
import { libraryLoaded } from '../../resolve/readStatblock';
import { resolveCollectionContext } from '../collectionContext';
import { saveStatblockAsTemplate } from '../gallery/galleryActions';
import { showImportOutcome } from '../fs-import/layoutImportFlow';
import { openStatblockEditor } from '../openStatblockEditor';
import { templateKeyPatch } from '../statblock-pane/templateKeyPatch';
import { copyFenceIntoStatblock } from '../statblock-pane/fenceCopy';
import { chosenRole, roleChoicesFor, roleTemplateId } from './collectionRoles';

export const EDIT_WITH_TEMPLATE = 'Edit with an Atlas template…';
export const COPY_INTO_STATBLOCK = 'Copy into a new statblock';

/** One row of the menu the action opens. */
export interface StatblockChoice {
  title: string;
  /** Muted after the title: where a template comes from, or a role's template. */
  hint?: string | undefined;
  run: () => Promise<unknown>;
}

/** Where the menu opens: the click that asked, else the top middle of the window, where Obsidian's prompts open. */
export interface MenuPlace {
  doc: Document;
  x: number;
  y: number;
}

/** A frontmatter statblock of Fantasy Statblocks: `statblock: true` without an Atlas template. */
export function isFsFrontmatterNote(app: App, file: TFile): boolean {
  return frontmatterSource(cachedFrontmatter(app, file))?.kind === 'fs-frontmatter';
}

/**
 * A note that may hold a ```statblock fence: `statblock: inline`, or a code
 * block in a note no frontmatter marks. Menus are built at once, so the body
 * is read only once the action is chosen.
 */
export function mayHoldStatblockFence(app: App, file: TFile): boolean {
  const frontmatter = cachedFrontmatter(app, file);
  if (frontmatter?.statblock === 'inline') return true;
  if (file.extension !== 'md' || frontmatterSource(frontmatter) !== null) return false;
  return app.metadataCache.getFileCache(file)?.sections?.some((section) => section.type === 'code') ?? false;
}

/** The place of a menu item's click, or the window's prompt point for a key or a command. */
export function menuPlace(event?: MouseEvent | KeyboardEvent): MenuPlace {
  const doc = event?.view?.document ?? activeDocument;
  if (event && 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0)) return { doc, x: event.clientX, y: event.clientY };
  return { doc, x: Math.round(doc.win.innerWidth / 2), y: Math.round(doc.win.innerHeight * 0.15) };
}

function roleRows(app: App, collectionId: string | null, choose: (roleId: string) => Promise<unknown>): StatblockChoice[] {
  return roleChoicesFor(app, collectionId).map((choice) => ({
    title: choice.name,
    hint: choice.templateName.trim().toLowerCase() === choice.name.trim().toLowerCase() ? undefined : choice.templateName,
    run: () => choose(choice.roleId),
  }));
}

/**
 * What "Edit with an Atlas template…" offers: the template imported from the
 * note's own layout (imported now when it never was, which then shows the
 * report and the batch for the layout's other notes), then the roles'
 * templates and, without the plugin, a template of the note's own shape.
 */
export function adoptionChoices(app: App, notePath: string, record: FrontmatterRecord, collectionId: string | null, doc: Document): StatblockChoice[] {
  const adopt = async (templateId: TemplateId): Promise<void> => {
    const outcome = await NoteFieldWriter.forApp(app).write(notePath, [templateKeyPatch(record, templateId)]);
    const problem = outcome.conflicts.length ? 'the note\'s template changed meanwhile.' : outcome.problem;
    if (problem) {
      new Notice(`Couldn't change the statblock: ${problem}`);
      return;
    }
    await openStatblockEditor(app, { notePath, collectionId, from: 'command' });
  };
  const importAndAdopt = async (layout: FsLayout): Promise<void> => {
    const imported = await importFsLayout(app, layout);
    await adopt(imported.id);
    showImportOutcome(app, doc, identityOf(layout), imported, { collectionId, offerOpen: true, except: notePath });
  };
  const layout = noteLayout(app, record);
  const imported = layout ? findImportedTemplate(TemplateLibrary.forApp(app).list(), layout) : null;
  const fsLayout = imported ? null : noteFsLayout(app, record);
  const choices: StatblockChoice[] = [];
  if (imported) choices.push({ title: imported.name, hint: 'From its layout', run: () => adopt(imported.template.id) });
  else if (fsLayout) choices.push({ title: fsLayout.name, hint: 'Imports its layout', run: () => importAndAdopt(fsLayout) });
  choices.push(...roleRows(app, collectionId, async (roleId) => {
    const chosen = chosenRole(app, collectionId, roleId);
    if (chosen) await adopt(await roleTemplateId(app, chosen.role));
  }));
  if (!isFantasyStatblocksAvailable()) {
    choices.push({ title: 'New template from this statblock', run: () => saveStatblockAsTemplate(app, notePath, record, collectionId) });
  }
  return choices;
}

/** What "Copy into a new statblock" offers: one row per role of the collection. */
export function fenceCopyChoices(app: App, notePath: string, collectionId: string | null): StatblockChoice[] {
  return roleRows(app, collectionId, (roleId) => copyFenceIntoStatblock(app, notePath, collectionId, roleId));
}

/** Runs the only choice at once; otherwise opens Obsidian's menu of them at `place`. */
export function offerChoices(choices: readonly StatblockChoice[], place: MenuPlace, task: string, failed: string): void {
  const run = (choice: StatblockChoice): void => runInBackground(choice.run(), task, failed);
  const [only] = choices;
  if (choices.length === 1 && only) {
    run(only);
    return;
  }
  const menu = new Menu();
  for (const choice of choices) {
    menu.addItem((item) => item.setTitle(choice.hint ? `${choice.title} (${choice.hint})` : choice.title).onClick(() => run(choice)));
  }
  menu.showAtPosition({ x: place.x, y: place.y }, place.doc);
}

/** "Edit with an Atlas template…" for a frontmatter statblock of Fantasy Statblocks. */
export async function offerFsAdoption(app: App, file: TFile, place: MenuPlace): Promise<void> {
  const record = cachedFrontmatter(app, file) ?? {};
  const [{ collectionId }] = await Promise.all([resolveCollectionContext(app, file.path, null), libraryLoaded(TemplateLibrary.forApp(app))]);
  const choices = adoptionChoices(app, file.path, record, collectionId, place.doc);
  offerChoices(choices, place, `Giving ${file.path} an Atlas template`, "Couldn't change the statblock.");
}

/** "Copy into a new statblock" for a note's ```statblock fence. */
export async function offerFenceCopy(app: App, file: TFile, place: MenuPlace): Promise<void> {
  if ((await statblockSourceOf(app, file))?.kind !== 'fs-fence') {
    new Notice('This note holds no statblock block to copy.');
    return;
  }
  const [{ collectionId }] = await Promise.all([resolveCollectionContext(app, file.path, null), libraryLoaded(TemplateLibrary.forApp(app))]);
  offerChoices(fenceCopyChoices(app, file.path, collectionId), place, `Copying the statblock of ${file.path}`, "Couldn't copy the statblock.");
}
