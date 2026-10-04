/**
 * The file side of a template session (§8.7): what the file holds, autosave,
 * and following the library: its own writes coming back, renames, someone
 * else's change, the file gone. Resolving a conflict and renaming build on it
 * (`SessionFile`). The draft and its history live in the session core, which
 * this side reaches through a `DraftHost`.
 */

import type { App } from 'obsidian';
import { serializeTemplate } from '../format/templateFormat';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import { observeDisk, saveProblemText, type SessionConflict } from './templateConflict';
import { templateName } from './templateFiles';
import type { TemplateLibrary } from './TemplateLibrary';
import { TemplateAutosave, type PendingWrite, type WriteOutcome } from './templateWriter';

export type ReadOnlyReason = 'built-in' | 'newer';

/** What the file side asks of the session core. */
export interface DraftHost {
  draft(): StatblockTemplate;
  inGesture(): boolean;
  /** Puts a template in place as the new start: no undo step, and the history forgotten. */
  reset(template: StatblockTemplate): void;
  /** Something the snapshot shows changed. */
  changed(): void;
}

const readOnlyOf = (entry: LibraryTemplate): ReadOnlyReason | null => (entry.builtIn ? 'built-in' : entry.status === 'newer' ? 'newer' : null);

export class SessionFileSync {
  path: string | null;
  name: string;
  readOnly: ReadOnlyReason | null;
  conflict: SessionConflict | null = null;
  problem: string | null = null;
  /** The template the file holds; null when it holds text that is not this template. */
  protected saved: StatblockTemplate | null;
  /** The text the file held when the session last loaded or wrote it. */
  protected baseText: string;
  /** The text of the other version while in conflict over a change. */
  protected other: string | null = null;
  /**
   * Whether the library has seen what the conflict is about. A write refused
   * on reading the disk can be ahead of it, and until then its "same" is stale.
   */
  private confirmed = false;
  private readonly autosave: TemplateAutosave;
  /** File operations of the session's own under way; the library's news waits for them. */
  private ownOperations = 0;
  private observeLater = false;

  constructor(
    protected readonly app: App,
    protected readonly library: TemplateLibrary,
    protected readonly id: TemplateId,
    entry: LibraryTemplate,
    text: string,
    protected readonly host: DraftHost,
  ) {
    this.path = entry.path;
    this.name = entry.name;
    this.readOnly = readOnlyOf(entry);
    this.saved = entry.template;
    this.baseText = text;
    this.autosave = new TemplateAutosave(app, library, this);
  }

  get writing(): boolean {
    return this.autosave.writing;
  }

  isDirty(): boolean {
    return this.host.draft() !== this.saved;
  }

  /** The draft changed: what renders the template shows it, and a committed step is saved soon. */
  draftChanged(): void {
    this.library.setDraft(this.id, this.isDirty() ? this.host.draft() : null);
    if (!this.host.inGesture() && this.isDirty()) this.autosave.schedule();
  }

  /** A gesture began: nothing is written until it ends. */
  holdWrites(): void {
    this.autosave.cancel();
  }

  flush(): Promise<void> {
    return this.autosave.flush();
  }

  takeWrite(): PendingWrite | null {
    if (this.readOnly || this.conflict || this.path === null) return null;
    const template = this.host.draft();
    if (template === this.saved) return null;
    const text = serializeTemplate(template);
    if (text !== this.baseText) return { path: this.path, baseText: this.baseText, text, template };
    this.markSaved(template);
    return null;
  }

  writingChanged(): void {
    this.host.changed();
  }

  settled(outcome: WriteOutcome, write: PendingWrite): void {
    if (outcome.kind === 'written') {
      this.baseText = write.text;
      this.problem = null;
      this.markSaved(write.template);
    } else if (outcome.kind === 'changed') {
      this.enterConflict('changed', outcome.text, false);
    } else if (outcome.kind === 'missing') {
      this.enterConflict('deleted', null, false);
    } else {
      this.problem = saveProblemText(outcome.problem);
    }
    this.afterOwnWork();
  }

  /** The library changed: the session's own write coming back, a rename, someone else's change, or the file gone. */
  libraryChanged(): void {
    if (this.readOnly === 'built-in' || this.path === null) return;
    if (this.writing || this.ownOperations > 0) {
      this.observeLater = true;
      return;
    }
    const seen = observeDisk(this.app, this.library, this.id, this.path, this.baseText);
    if (seen.kind === 'gone') {
      this.enterConflict('deleted', null, true);
    } else {
      this.movedTo(seen.path);
      if (seen.kind === 'same' && this.conflict && this.confirmed) this.leaveConflict();
      if (seen.kind === 'changed') {
        // A clean session takes the change in; undoing past it would revert someone else's work.
        if (seen.entry && !this.host.inGesture() && !this.isDirty() && !this.conflict) this.load(seen.text, seen.entry);
        else this.enterConflict('changed', seen.text, true);
      }
    }
    this.host.changed();
  }

  dispose(): void {
    this.autosave.dispose();
    this.library.setDraft(this.id, null);
  }

  protected markSaved(template: StatblockTemplate): void {
    this.saved = template;
    this.library.setDraft(this.id, this.isDirty() ? this.host.draft() : null);
  }

  /** Takes a version of the file in as the session's start. */
  protected load(text: string, entry: LibraryTemplate): void {
    this.baseText = text;
    this.saved = entry.template;
    this.readOnly = readOnlyOf(entry);
    this.problem = null;
    this.leaveConflict();
    this.host.reset(entry.template);
    this.library.setDraft(this.id, null);
  }

  protected movedTo(path: string): void {
    if (path === this.path) return;
    this.path = path;
    this.name = templateName(path);
  }

  /** Stops saving until the user chooses a version; nothing is written meanwhile. */
  protected enterConflict(conflict: SessionConflict, other: string | null, confirmed: boolean): void {
    this.confirmed = confirmed || (this.confirmed && this.conflict === conflict);
    this.conflict = conflict;
    this.other = other;
    this.autosave.cancel();
  }

  protected leaveConflict(): void {
    this.conflict = null;
    this.other = null;
    this.confirmed = false;
    if (this.isDirty() && !this.host.inGesture()) this.autosave.schedule();
  }

  /** Runs a file operation of the session's own; what the library announces meanwhile waits for `afterOwnWork`. */
  protected async ownWork<T>(work: () => Promise<T>): Promise<T> {
    this.ownOperations += 1;
    try {
      return await work();
    } finally {
      this.ownOperations -= 1;
    }
  }

  /** Takes in what the library announced while the session's own work was under way. */
  protected afterOwnWork(): void {
    if (this.writing || this.ownOperations > 0 || !this.observeLater) {
      this.host.changed();
      return;
    }
    this.observeLater = false;
    this.libraryChanged();
  }
}
