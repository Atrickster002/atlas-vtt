/**
 * A view's hold on an open template (§8.7). Every view of one template, in
 * any window, shares one draft, one history and one save state: `open`
 * counts holders per app and id, and the last `release` writes what is
 * pending before the session goes away.
 *
 * Edits are pure functions of the template (`model/treeOps`, `fieldOps`),
 * applied to the draft as it is when they run. One `apply` is one undo step;
 * a gesture (a drag, a label being typed, a slider) is one step however many
 * edits it makes, and an abandoned gesture puts back what it changed and
 * leaves none. A step is written 600 ms after it is made, never during a
 * gesture, and only while the file still holds what the session last loaded
 * or wrote.
 */

import type { App } from 'obsidian';
import { runInBackground } from '../../utils/backgroundTask';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import type { SessionCore, SessionSnapshot } from './sessionCore';
import type { ConflictChoice, RenameResult } from './sessionFile';
import { acquireSessionCore, releaseSessionCore } from './sessionRegistry';

export type { SaveState, SessionSnapshot } from './sessionCore';
export type { ConflictChoice, RenameResult } from './sessionFile';

export class TemplateSession {
  /** A new hold on the template's session; null when the library knows no template by this id. */
  static open(app: App, id: TemplateId): TemplateSession | null {
    const core = acquireSessionCore(app, id);
    return core ? new TemplateSession(app, core) : null;
  }

  private released = false;
  /** The gestures this handle began and has not ended yet. */
  private gestures = 0;

  private constructor(private readonly app: App, private readonly core: SessionCore) {}

  /**
   * Lets go of the session; after the last holder, pending edits are written and the session closes. Safe to call twice.
   * A gesture still open (a slider held while its tab closes) ends here and keeps what it changed: the core is shared,
   * and a gesture left open would hold every other view's undo, redo and autosave.
   */
  release(): void {
    if (this.released) return;
    for (; this.gestures > 0; this.gestures -= 1) this.core.endGesture();
    this.released = true;
    runInBackground(releaseSessionCore(this.app, this.core), 'Saving the statblock template');
  }

  /** For `useSyncExternalStore`: a new object only when something it holds changed. */
  readonly getSnapshot = (): SessionSnapshot => this.core.getSnapshot();

  readonly subscribe = (listener: () => void): (() => void) => (this.released ? () => undefined : this.core.subscribe(listener));

  /** Applies a pure edit to the draft. Nothing happens while read-only, or when the edit returns its input. */
  apply(edit: (template: StatblockTemplate) => StatblockTemplate): void {
    if (!this.released) this.core.apply(edit);
  }

  beginGesture(): void {
    if (!this.released && this.core.beginGesture()) this.gestures += 1;
  }

  /** Ends the innermost gesture this handle began; never one another view of the template holds. */
  endGesture(): void {
    if (this.released || this.gestures === 0) return;
    this.gestures -= 1;
    this.core.endGesture();
  }

  abandonGesture(): void {
    if (this.released || this.gestures === 0) return;
    this.gestures -= 1;
    this.core.abandonGesture();
  }

  undo(): void {
    if (!this.released) this.core.undo();
  }

  redo(): void {
    if (!this.released) this.core.redo();
  }

  /** Writes a pending step now. */
  flush(): Promise<void> {
    return this.core.flush();
  }

  /** Renames the template's file; its basename is the name. */
  rename(name: string): Promise<RenameResult> {
    return this.released ? Promise.resolve({ ok: false, problem: 'The template is closed.' }) : this.core.rename(name);
  }

  /** What to do about a version written elsewhere, or a file deleted, while the session had unsaved edits. */
  resolveConflict(choice: ConflictChoice): Promise<void> {
    return this.released ? Promise.resolve() : this.core.resolveConflict(choice);
  }
}
