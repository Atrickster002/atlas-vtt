/**
 * A built-in in the template editor (spec §9.3): shown and edited like any
 * template, never changed itself. The first change makes the collection's own
 * copy of it (`ensureOwnCopy`: the recorded one, else a new one, recorded),
 * opens the copy's session and hands it every change made meanwhile, so the
 * edit lands in the copy as one step, inside the gesture it was part of. The
 * editor keeps this session the whole time, so its selection, an open label
 * and a running drag carry on; the view turns to the copy's file. The note
 * the editor was opened from, while it names the built-in, then names the copy.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { ensureOwnCopy, type OwnCopy } from '../../library/ownCopy';
import type { TemplateEdit } from '../../library/sessionStore';
import { TemplateSession, type ConflictChoice, type RenameResult, type SessionSnapshot } from '../../library/TemplateSession';
import type { StatblockTemplate, TemplateId } from '../../model/templateTypes';
import { noteName } from '../../../utils/pathUtils';
import type { EditorSession } from './sessionTypes';

export interface CopyOnWriteOptions {
  app: App;
  /** The collection whose copy changes go to; the default collection where none is known. */
  collectionId: () => string | null;
  /** The note the editor was opened from: it switches to the copy while it names the built-in. */
  fromNote: () => string | null;
  /** Writes `atlas-template` of a note (one patch, compare-and-swap on the built-in). */
  switchNote: (path: string, from: TemplateId, to: TemplateId) => Promise<boolean>;
  /** The copy exists: the view shows its file from now on. */
  onCopied: (copy: OwnCopy) => void;
  /** Says what happened (a toast and the live region). */
  notify: (text: string) => void;
}

/** What a session that a view holds can also do: let go. */
export interface HeldEditorSession extends EditorSession {
  release: () => void;
}

export class CopyOnWriteSession implements HeldEditorSession {
  private copy: TemplateSession | null = null;
  /** Changes made before the copy's session opened, in order. */
  private pending: TemplateEdit[] = [];
  /** Where each gesture begun before the copy existed started, as a count of pending changes. */
  private gestureMarks: number[] = [];
  /** The built-in with the pending changes, shown until the copy takes over. */
  private preview: StatblockTemplate | null = null;
  private making = false;
  private released = false;
  private cached: { base: SessionSnapshot; preview: StatblockTemplate | null; snapshot: SessionSnapshot } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly stopBuiltIn: () => void;
  private stopCopy: (() => void) | null = null;

  constructor(private readonly builtIn: TemplateSession, private readonly options: CopyOnWriteOptions) {
    this.stopBuiltIn = builtIn.subscribe(() => this.emit());
  }

  /** The copy's snapshot once it exists; until then the built-in's, editable, with the pending changes. */
  readonly getSnapshot = (): SessionSnapshot => {
    if (this.copy) return this.copy.getSnapshot();
    const base = this.builtIn.getSnapshot();
    if (this.cached?.base === base && this.cached.preview === this.preview) return this.cached.snapshot;
    const snapshot: SessionSnapshot = {
      ...base,
      template: this.preview ?? base.template,
      readOnly: false,
      readOnlyReason: null,
      canUndo: false,
      canRedo: false,
      copyOnWrite: { builtInId: base.id, builtInName: base.name },
    };
    this.cached = { base, preview: this.preview, snapshot };
    return snapshot;
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  apply(edit: TemplateEdit): void {
    if (this.released) return;
    if (this.copy) {
      this.copy.apply(edit);
      return;
    }
    const before = this.preview ?? this.builtIn.getSnapshot().template;
    const after = edit(before);
    if (after === before) return;
    this.pending.push(edit);
    this.preview = after;
    this.emit();
    void this.makeCopy();
  }

  beginGesture(): void {
    if (this.released) return;
    if (this.copy) this.copy.beginGesture();
    else this.gestureMarks.push(this.pending.length);
  }

  endGesture(): void {
    if (this.copy && this.gestureMarks.length === 0) this.copy.endGesture();
    else this.gestureMarks.pop();
  }

  abandonGesture(): void {
    if (this.copy && this.gestureMarks.length === 0) {
      this.copy.abandonGesture();
      return;
    }
    const mark = this.gestureMarks.pop();
    if (mark === undefined || this.copy) return;
    this.pending.length = mark;
    this.preview = this.pending.reduce((template, edit) => edit(template), this.builtIn.getSnapshot().template);
    if (this.pending.length === 0) this.preview = null;
    this.emit();
  }

  undo(): void {
    this.copy?.undo();
  }

  redo(): void {
    this.copy?.redo();
  }

  flush(): Promise<void> {
    return this.copy?.flush() ?? Promise.resolve();
  }

  /** A built-in keeps its name: renaming makes the copy first, then renames that. */
  async rename(name: string): Promise<RenameResult> {
    if (!this.copy) await this.makeCopy();
    return this.copy ? this.copy.rename(name) : { ok: false, problem: 'Built-in templates keep their name.' };
  }

  resolveConflict(choice: ConflictChoice): Promise<void> {
    return this.copy?.resolveConflict(choice) ?? Promise.resolve();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.stopBuiltIn();
    this.stopCopy?.();
    this.builtIn.release();
    this.copy?.release();
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** Once: the collection's copy, its session, and every pending change handed to it; one copy per collection and built-in. */
  private async makeCopy(): Promise<void> {
    if (this.making || this.copy) return;
    this.making = true;
    const { app } = this.options;
    const builtInId = this.builtIn.getSnapshot().id;
    const builtInName = this.builtIn.getSnapshot().name;
    try {
      const collectionId = this.options.collectionId() ?? AssetService.getInstance(app).getDefaultCollectionId();
      const own = await ensureOwnCopy(app, collectionId, builtInId);
      const session = TemplateSession.open(app, own.id);
      if (!session || this.released) {
        session?.release();
        return;
      }
      this.adopt(session);
      await this.moveNote(builtInId, own.id, builtInName, own.made);
      this.options.onCopied(own);
    } catch (error) {
      console.error('[Atlas] Making the copy of a built-in template failed:', error);
      this.options.notify(`Couldn't make your own copy of ${builtInName}.`);
      this.pending = [];
      this.preview = null;
      this.emit();
    } finally {
      this.making = false;
    }
  }

  /** The copy takes over: the gestures still running, then the changes made meanwhile, as one step. */
  private adopt(session: TemplateSession): void {
    for (let open = this.gestureMarks.length; open > 0; open -= 1) session.beginGesture();
    this.gestureMarks = [];
    const pending = this.pending;
    this.pending = [];
    if (pending.length) session.apply((template) => pending.reduce((current, edit) => edit(current), template));
    this.copy = session;
    this.preview = null;
    this.stopCopy = session.subscribe(() => this.emit());
    this.emit();
  }

  private async moveNote(builtInId: TemplateId, copyId: TemplateId, builtInName: string, made: boolean): Promise<void> {
    const note = this.options.fromNote();
    const moved = note ? await this.options.switchNote(note, builtInId, copyId) : false;
    if (moved && note) this.options.notify(`Made your own copy of ${builtInName}. ${noteName(note)} uses it now.`);
    else this.options.notify(made ? `Made your own copy of ${builtInName}. Your changes go there.` : `Your changes go to your copy of ${builtInName}.`);
  }
}
