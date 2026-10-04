/**
 * What a session does to its file on request (§8.7): resolving a conflict
 * (keep mine, use the other version, save mine as a copy, recreate a deleted
 * file), renaming, and the last write before it goes away.
 */

import { readTemplateFile, templateName } from './templateFiles';
import { copyName, folderOf, templateNameProblem, templatePathIn, templatePathTaken } from './templatePaths';
import { newTemplateFile, problemOf, writeNewTemplateFile } from './templateWriter';
import { SessionFileSync } from './sessionFileSync';

export type ConflictChoice = 'keep-mine' | 'use-other' | 'save-copy' | 'recreate';
export type RenameResult = { ok: true } | { ok: false; problem: string };

export class SessionFile extends SessionFileSync {
  async resolveConflict(choice: ConflictChoice): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return;
    if (choice === 'save-copy') {
      await this.saveCopy();
      this.useOther();
    } else if (choice === 'use-other') {
      this.useOther();
    } else if (conflict === 'deleted') {
      await this.recreate();
    } else if (choice === 'keep-mine') {
      await this.keepMine();
    }
    this.afterOwnWork();
  }

  /**
   * Writes what is pending before the session goes away. A draft in conflict
   * has nowhere to go, so it is kept as a copy beside the template.
   */
  async flushForExit(): Promise<void> {
    if (this.conflict && this.isDirty() && !this.readOnly) await this.saveCopy();
    else await this.flush();
  }

  /** Renames the file: the name is its basename. Pending edits are written first. */
  async rename(name: string): Promise<RenameResult> {
    if (this.readOnly === 'built-in' || this.path === null) return { ok: false, problem: 'Built-in templates can\'t be renamed.' };
    const problem = templateNameProblem(name);
    if (problem) return { ok: false, problem };
    await this.flush();
    if (this.conflict) return { ok: false, problem: 'Choose which version to keep first.' };
    const path = this.path;
    const file = this.app.vault.getFileByPath(path);
    if (!file) return { ok: false, problem: 'The template\'s file is gone.' };
    const target = templatePathIn(folderOf(path), name.trim());
    if (target === path) return { ok: true };
    if (templatePathTaken(this.app, target, path)) return { ok: false, problem: `There is already a template named “${name.trim()}” here.` };
    try {
      await this.ownWork(() => this.app.fileManager.renameFile(file, target));
      this.movedTo(target);
      return { ok: true };
    } catch (error) {
      return { ok: false, problem: `Couldn't rename: ${problemOf(error)}` };
    } finally {
      this.afterOwnWork();
    }
  }

  private useOther(): void {
    const entry = this.other === null || this.path === null ? null : readTemplateFile(this.path, this.other).entry;
    if (this.conflict === 'deleted') {
      // Nothing to take: back to the version last saved, and the file stays gone.
      if (this.saved) this.host.reset(this.saved);
    } else if (this.other !== null && entry?.template.id === this.id) {
      this.load(this.other, entry);
    } else {
      this.problem = 'The other version can\'t be read as this template.';
    }
  }

  /** Writes the draft over the other version; Obsidian's file recovery keeps that one. */
  private async keepMine(): Promise<void> {
    const file = this.path === null ? null : this.app.vault.getFileByPath(this.path);
    if (!file) {
      this.enterConflict('deleted', null, false);
      return;
    }
    this.baseText = await this.ownWork(() => this.app.vault.read(file));
    this.saved = null;
    this.leaveConflict();
    await this.flush();
  }

  /** Writes the draft to a file again, where the deleted one was or beside it when that place is taken. */
  private async recreate(): Promise<void> {
    const template = this.host.draft();
    const folder = this.path === null ? '' : folderOf(this.path);
    const written = await this.ownWork(() => writeNewTemplateFile(this.app, this.library, folder, this.name, template));
    this.path = written.path;
    this.name = templateName(written.path);
    this.baseText = written.text;
    this.problem = null;
    this.markSaved(template);
    this.leaveConflict();
  }

  private async saveCopy(): Promise<void> {
    const folder = this.path === null ? undefined : folderOf(this.path);
    await this.ownWork(() => newTemplateFile(this.app, this.library, copyName(this.name), this.host.draft(), folder));
  }
}
