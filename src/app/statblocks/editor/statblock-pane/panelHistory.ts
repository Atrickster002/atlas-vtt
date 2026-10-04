/**
 * The panel's undo (spec §8.5). The panel changes two things: the note's
 * values, whose history is the note's own (CodeMirror, through the writer),
 * and, for a structural change, its template, whose history is the
 * template's session. The log records which history took each action, so
 * Mod+Z in the panel undoes the newest of the panel's own actions in the
 * history that holds it, and never a template step made elsewhere.
 */

import type { StatblockTemplate } from '../../model/templateTypes';

/** A template step the panel made: the session it went through and the template it left. */
export interface TemplateStep {
  /** The session's template right now. */
  current: () => StatblockTemplate;
  undo: () => void;
  redo: () => void;
  /** The template the step left behind; the step is the session's newest while the session still holds it. */
  after: StatblockTemplate;
  /** The template before it, which an undo leaves. */
  before: StatblockTemplate;
  /** Anything else the action did, taken back after the step (a note switched to a copy). */
  undoMore?: (() => void) | undefined;
  redoMore?: (() => void) | undefined;
  /** Undone, it cannot be redone (its undo deleted the copy it made). */
  once?: boolean | undefined;
}

export type PanelAction = { kind: 'note' } | { kind: 'template'; step: TemplateStep };

/** What an undo or redo did: the note's history is asked, the template's step was taken, or it could not be. */
export type HistoryResult = 'note' | 'template' | 'elsewhere' | 'nothing';

const LIMIT = 100;

export class PanelHistory {
  private readonly done: PanelAction[] = [];
  private readonly undone: PanelAction[] = [];

  /** A write to the note's values. */
  noteChanged(): void {
    this.push({ kind: 'note' });
  }

  templateChanged(step: TemplateStep): void {
    this.push({ kind: 'template', step });
  }

  undo(): HistoryResult {
    const action = this.done.at(-1);
    if (!action) return 'nothing';
    if (action.kind === 'template' && action.step.current() !== action.step.after) return 'elsewhere';
    this.done.pop();
    if (action.kind === 'note' || !action.step.once) this.undone.push(action);
    if (action.kind === 'note') return 'note';
    action.step.undo();
    action.step.undoMore?.();
    return 'template';
  }

  redo(): HistoryResult {
    const action = this.undone.at(-1);
    if (!action) return 'nothing';
    if (action.kind === 'template' && action.step.current() !== action.step.before) return 'elsewhere';
    this.undone.pop();
    this.done.push(action);
    if (action.kind === 'note') return 'note';
    action.step.redo();
    action.step.redoMore?.();
    return 'template';
  }

  private push(action: PanelAction): void {
    this.done.push(action);
    if (this.done.length > LIMIT) this.done.shift();
    this.undone.length = 0;
  }
}
