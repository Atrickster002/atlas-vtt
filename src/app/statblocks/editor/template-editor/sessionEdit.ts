/**
 * Running pure template edits through a session: each is one `apply`, so one
 * undo step, worked out on the template the session holds at that moment and
 * never on one read earlier.
 */

import type { TreeEdit, TreeRefusal } from '../../model/treeEdit';
import type { StatblockTemplate, TemplateLayout } from '../../model/templateTypes';
import type { BlockSelection } from './selection';
import type { EditorSession, SessionSnapshot } from './sessionTypes';

/** What an editor action leaves behind: the selection, and what to say about it. */
export interface EditOutcome {
  /** The selection afterwards; unset leaves it as it is. */
  select?: BlockSelection | undefined;
  /** Said in the view's live region. */
  announce?: string | undefined;
  /** Names of what a delete took away, for the "Speed deleted" toast. */
  deleted?: string | undefined;
}

export const NOTHING: EditOutcome = {};

/** Why a template cannot be changed, in the words the editor says it; null for an editable one. */
export function readOnlyMessage(snapshot: Pick<SessionSnapshot, 'readOnly' | 'readOnlyReason'>): string | null {
  if (!snapshot.readOnly) return null;
  return snapshot.readOnlyReason === 'newer' ? 'Update Atlas to edit this template.' : 'Built-in template. Make a copy to change it.';
}

/** Why the Name or the token picture stays. */
export const CORE_SLOT_MESSAGE = 'Every statblock has a name and token art. Move them, but they stay.';

/** A refused edit in plain words, where the refusal is one the user can act on. */
export function refusalMessage(reason: TreeRefusal): string | null {
  switch (reason) {
    case 'not-allowed-here': return "That block can't go there.";
    case 'core-slot': return CORE_SLOT_MESSAGE;
    case 'not-siblings': return 'Select blocks that stand in the same place.';
    case 'not-adjacent': return 'Select blocks that stand next to each other.';
    case 'cannot-turn-into': return "This block can't turn into that.";
    case 'not-a-container': return 'Select a section or row first.';
    default: return null;
  }
}

/**
 * Applies `edit` to the session's template and returns what it computed, or
 * null where the session took no edit (a read-only template). `edit` returns
 * the next template and its own result; the same template makes no step.
 */
export function applyEdit<T>(
  session: EditorSession, edit: (template: StatblockTemplate) => { template: StatblockTemplate; result: T },
): T | null {
  const out: { result: T | null } = { result: null };
  session.apply((template) => {
    const next = edit(template);
    out.result = next.result;
    return next.template;
  });
  return out.result;
}

/** Applies a tree operation to the layout; a refused one changes nothing. */
export function applyTree(
  session: EditorSession, op: (layout: TemplateLayout, template: StatblockTemplate) => TreeEdit,
): TreeEdit | null {
  return applyEdit(session, (template) => {
    const edit = op(template.layout, template);
    const changed = edit.ok && edit.layout !== template.layout;
    return { template: changed ? { ...template, layout: edit.layout } : template, result: edit };
  });
}

/**
 * Runs several tree operations as one step, each on the layout the one before
 * left; all or nothing, so a refusal anywhere keeps the template as it was.
 */
export function chainTree(
  layout: TemplateLayout, ops: ReadonlyArray<(layout: TemplateLayout) => TreeEdit>,
): TreeEdit {
  let current = layout;
  let focus: string | null = null;
  for (const op of ops) {
    const edit = op(current);
    if (!edit.ok) return { ok: false, layout, reason: edit.reason };
    current = edit.layout;
    focus ??= edit.focus;
  }
  return { ok: true, layout: current, focus };
}

/** The outcome of a tree edit the session refused or took: read-only, refusal, or success. */
export function outcomeOf(
  edit: TreeEdit | null, snapshot: SessionSnapshot, success: (edit: Extract<TreeEdit, { ok: true }>) => EditOutcome,
): EditOutcome {
  if (edit === null) return { announce: readOnlyMessage(snapshot) ?? undefined };
  if (!edit.ok) return { announce: refusalMessage(edit.reason) ?? undefined };
  return success(edit);
}
