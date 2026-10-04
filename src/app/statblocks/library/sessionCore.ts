/**
 * One open template, shared by every view of it in any window (§8.7): the
 * draft with its history (§7.8) and its file. Views hold `TemplateSession`
 * handles; the registry keeps one core per app and template id.
 */

import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import {
  abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction, getHistoryStore, runUntracked, type HistoryState,
} from '../../stores/history';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import { createTemplateDraftStore, type TemplateDraftStore, type TemplateEdit } from './sessionStore';
import { SessionFile, type ConflictChoice, type RenameResult } from './sessionFile';
import type { ReadOnlyReason } from './sessionFileSync';
import type { SessionConflict } from './templateConflict';
import { TemplateLibrary } from './TemplateLibrary';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface SessionSnapshot {
  id: TemplateId;
  /** The file's basename; a built-in's own name. */
  name: string;
  /** Null for built-ins. */
  path: string | null;
  /** The draft. */
  template: StatblockTemplate;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  saveState: SaveState;
  /** "Couldn't save: <reason>. Retrying", or why a conflict could not be resolved as asked. */
  saveProblem: string | null;
  conflict: SessionConflict | null;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * A built-in shown editable (`copyOnWriteSession.ts`): its first change
   * makes the collection's own copy, which the editor shows from then on.
   */
  copyOnWrite?: { builtInId: TemplateId; builtInName: string } | undefined;
}

function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (Object.keys(a) as (keyof SessionSnapshot)[]).every((key) => a[key] === b[key]);
}

export class SessionCore {
  /** Builds the core for a template the library knows; null when it knows none by this id. */
  static create(app: App, id: TemplateId): SessionCore | null {
    const library = TemplateLibrary.forApp(app);
    const entry = library.get(id);
    if (!entry) return null;
    const text = entry.path === null ? '' : library.fileAt(entry.path)?.text;
    return text === undefined ? null : new SessionCore(app, library, entry, text);
  }

  readonly id: TemplateId;

  private readonly store: TemplateDraftStore;
  private readonly file: SessionFile;
  /** Where each open gesture started, innermost last. */
  private readonly gestureStarts: StatblockTemplate[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly detachers: Array<() => void> = [];
  private snapshot: SessionSnapshot;
  private disposed = false;

  private constructor(app: App, library: TemplateLibrary, entry: LibraryTemplate, text: string) {
    this.id = entry.template.id;
    this.store = createTemplateDraftStore(entry.template);
    this.file = new SessionFile(app, library, this.id, entry, text, this);
    this.snapshot = this.build();
    this.detachers.push(
      this.store.subscribe((state, previous) => { if (state.template !== previous.template) this.draftChanged(); }),
      this.history().subscribe(() => this.changed()),
      library.subscribe(() => { if (!this.disposed) this.file.libraryChanged(); }),
    );
  }

  // DraftHost
  draft(): StatblockTemplate {
    return this.store.getState().template;
  }

  inGesture(): boolean {
    return this.gestureStarts.length > 0;
  }

  reset(template: StatblockTemplate): void {
    // Clearing the history also closes any transaction an open gesture held.
    this.gestureStarts.length = 0;
    runUntracked(this.store, () => this.store.setState({ template }));
    this.history().getState().clear();
  }

  changed(): void {
    const next = this.build();
    if (sameSnapshot(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  apply(edit: TemplateEdit): void {
    if (this.disposed || this.file.readOnly) return;
    this.store.getState().edit(edit);
  }

  /** False when no gesture began: the session is read-only or gone. */
  beginGesture(): boolean {
    if (this.disposed || this.file.readOnly) return false;
    this.gestureStarts.push(this.draft());
    this.file.holdWrites();
    beginHistoryTransaction(this.store);
    return true;
  }

  endGesture(): void {
    if (this.gestureStarts.pop() === undefined) return;
    endHistoryTransaction(this.store);
    this.gestureEnded();
  }

  /** Puts back what the innermost gesture changed and leaves no step for it. */
  abandonGesture(): void {
    const start = this.gestureStarts.pop();
    if (start === undefined) return;
    // Still inside the transaction: putting the start back records nothing.
    this.store.setState({ template: start });
    abandonHistoryTransaction(this.store);
    this.gestureEnded();
  }

  undo(): void {
    if (!this.disposed && !this.file.readOnly && !this.inGesture()) this.history().getState().undo();
  }

  redo(): void {
    if (!this.disposed && !this.file.readOnly && !this.inGesture()) this.history().getState().redo();
  }

  flush(): Promise<void> {
    return this.file.flush();
  }

  /** The last write before the session goes away; a draft in conflict is kept as a copy. */
  flushForExit(): Promise<void> {
    return this.file.flushForExit();
  }

  rename(name: string): Promise<RenameResult> {
    return this.file.rename(name);
  }

  resolveConflict(choice: ConflictChoice): Promise<void> {
    return this.file.resolveConflict(choice);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.file.dispose();
    this.listeners.clear();
  }

  private history(): StoreApi<HistoryState> {
    const history = getHistoryStore(this.store);
    if (!history) throw new Error('A template draft store has no history.');
    return history;
  }

  private draftChanged(): void {
    this.file.draftChanged();
    this.changed();
  }

  private gestureEnded(): void {
    if (!this.inGesture()) this.file.draftChanged();
    this.changed();
  }

  private build(): SessionSnapshot {
    const { pastStates, futureStates } = this.history().getState();
    const { readOnly, conflict, problem } = this.file;
    const editable = readOnly === null;
    return {
      id: this.id,
      name: this.file.name,
      path: this.file.path,
      template: this.draft(),
      readOnly: !editable,
      readOnlyReason: readOnly,
      saveState: this.saveState(),
      saveProblem: problem,
      conflict,
      canUndo: editable && pastStates.length > 0,
      canRedo: editable && futureStates.length > 0,
    };
  }

  private saveState(): SaveState {
    if (this.file.conflict) return 'conflict';
    if (this.file.writing) return 'saving';
    const dirty = !this.file.readOnly && this.file.isDirty();
    if (dirty && this.file.problem) return 'error';
    return dirty ? 'dirty' : 'saved';
  }
}
