import { useCallback, useMemo, useRef, useState } from 'react';
import { findBlock, flattenReadingOrder } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { LabelEditing } from './ChromeLayer';
import { commitLabel } from './labelCommit';
import { labelTargetOf } from './labelTargets';
import type { BlockSelection } from './selection';
import { applyEdit, readOnlyMessage } from './sessionEdit';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import type { CollectionFieldKeys } from './useCollectionFieldKeys';

export interface LabelEditingInput {
  session: EditorSession;
  snapshot: SessionSnapshot;
  collectionKeys: CollectionFieldKeys;
  select: (selection: BlockSelection, focus?: boolean) => void;
  announce: (text: string) => void;
  drawn: (id: string) => boolean;
}

interface OpenLabel {
  id: string;
  kind: LabelEditing['kind'];
  text: string;
}

export interface LabelEditingState {
  /** The label being edited, for the canvas; null while none is. */
  editing: LabelEditing | null;
  editLabel: (id: string) => void;
}

/** The next block after `id` in reading order (or before it) that has a label and is drawn. */
function labelledNeighbour(template: StatblockTemplate, id: string, step: 1 | -1, drawn: (id: string) => boolean): string | null {
  const order = flattenReadingOrder(template.layout.blocks);
  const from = order.findIndex((block) => block.id === id);
  for (let index = from + step; index >= 0 && index < order.length; index += step) {
    const block = order[index];
    if (block && drawn(block.id) && labelTargetOf(block, template.fields)) return block.id;
  }
  return null;
}

/** What the live region says when a first label bound its block. */
function boundMessage(bound: { key: string; created: boolean; fromCollection: boolean }, keys: CollectionFieldKeys): string {
  if (bound.fromCollection) {
    const count = keys.get(bound.key) ?? 0;
    return `Shows the property ${count} ${count === 1 ? 'statblock' : 'statblocks'} of this collection hold.`;
  }
  return bound.created ? 'Made a new property for it.' : 'Shows a property this template has.';
}

/**
 * Inline label editing (§7.6): which block's label is open, and committing
 * it through the session as one step. Tab commits and opens the next label,
 * Shift+Tab the one before; Escape reverts.
 */
export function useLabelEditing(input: LabelEditingInput): LabelEditingState {
  // What the label said when it opened: later edits of the block do not reset what is typed.
  const [open, setOpen] = useState<OpenLabel | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const openAt = useCallback((id: string, template: StatblockTemplate): boolean => {
    const block = findBlock(template.layout.blocks, id)?.block;
    const target = block ? labelTargetOf(block, template.fields) : null;
    if (!target) return false;
    latest.current.select([id], false);
    setOpen({ id, kind: target.kind, text: target.text });
    return true;
  }, []);

  const editLabel = useCallback((id: string): void => {
    // The session's own snapshot: a block inserted a moment ago is in it before the editor renders again.
    const { session, announce } = latest.current;
    const snapshot = session.getSnapshot();
    const locked = readOnlyMessage(snapshot);
    if (locked) {
      announce(locked);
      return;
    }
    openAt(id, snapshot.template);
  }, [openAt]);

  const commit = useCallback((id: string, text: string): void => {
    const { session, collectionKeys, announce } = latest.current;
    const bound = applyEdit(session, (template) => {
      const result = commitLabel(template, id, text, collectionKeys.keys());
      return { template: result.template, result: result.bound ?? null };
    });
    if (bound) announce(boundMessage(bound, collectionKeys));
  }, []);

  const close = useCallback((id: string, refocus = true): void => {
    setOpen(null);
    if (refocus) latest.current.select([id], true);
  }, []);

  const exists = open !== null && findBlock(input.snapshot.template.layout.blocks, open.id) !== null;

  const editing = useMemo((): LabelEditing | null => {
    if (!open || !exists) return null;
    const { id } = open;
    return {
      blockId: id,
      kind: open.kind,
      text: open.text,
      onCommit: (text, refocus) => {
        commit(id, text);
        close(id, refocus);
      },
      onCancel: () => close(id),
      onStep: (text, step) => {
        commit(id, text);
        const { session, drawn } = latest.current;
        const template = session.getSnapshot().template;
        const next = labelledNeighbour(template, id, step, drawn);
        if (next === null || !openAt(next, template)) close(id);
      },
    };
  }, [open, exists, commit, close, openAt]);

  return { editing, editLabel };
}
