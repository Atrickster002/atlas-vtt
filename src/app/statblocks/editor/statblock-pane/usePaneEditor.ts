import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { App } from 'obsidian';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateField } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import type { BlockChrome } from '../../render/blockChrome';
import { foldedIds, type FoldedBlock } from '../../render/foldRule';
import { sheetState } from '../../render/sheetState';
import type { ValueEditing } from '../../render/valueSlot';
import { readField, type FieldRecord } from '../../values/fieldValues';
import type { PaneServices } from '../paneServices';
import { editableSpots, neighbourSpot } from './editableSpots';
import { entryList, moveEntryToPatch } from './entryPatches';
import type { EditTarget, FieldConflict, ListMover, PaneEditController } from './paneEditContext';
import { PanelHistory } from './panelHistory';
import { paneChrome } from './paneChrome';
import { renderPaneEntry } from './PaneEntry';
import { renderPaneSlot } from './PaneSlot';
import type { PendingCommit } from './paneTypes';
import { useAddSection } from './useAddSection';
import { usePanelSessions } from './usePanelSessions';
import { fieldPatches } from './valuePatches';

export interface PaneEditorOptions {
  app: App;
  services: PaneServices;
  notePath: string;
  collectionId: string | null;
  template: StatblockTemplate;
  record: FieldRecord;
  writable: boolean;
  pendingCommit: PendingCommit;
  /** The card's element, where focus returns after editing. */
  cardRef: RefObject<HTMLElement | null>;
  /** Sections folded into chips under the card: not drawn, so none of their values is a stop. */
  folded: readonly FoldedBlock[];
  /** Unfolds a section in place (a chip), or folds it again once its values were cleared. */
  setUnfolded: (blockId: string, unfolded: boolean) => void;
  /** The note's template as the library holds it; null while it can't change. */
  entry: LibraryTemplate | null;
  /** Tab past the last value, or Shift+Tab before the first. */
  onExit: (step: 1 | -1) => void;
  /** A commit reached the note (the first one dismisses the first-visit hint). */
  onCommitted: () => void;
  /** Why the last write failed, or null once one succeeds. */
  onWriteProblem: (problem: string | null) => void;
  announce: (text: string) => void;
}

export interface PaneEditor {
  controller: PaneEditController;
  chrome: BlockChrome;
  valueEditing: ValueEditing;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Rendering a value's slot never changes: what it shows comes from the controller's context. */
const VALUE_EDITING: ValueEditing = { slot: renderPaneSlot, entry: renderPaneEntry };

/**
 * The pane's editing state (§7.6, §8.5, §8.6): which value is being edited,
 * the conflicts the note reported, and the writes, each a set of patches
 * whose base is the value the edit started from.
 */
export function usePaneEditor(options: PaneEditorOptions): PaneEditor {
  const { app, services, notePath, collectionId, template, record, writable, pendingCommit, cardRef, folded, setUnfolded, entry } = options;
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [conflicts, setConflicts] = useState<ReadonlyMap<FieldKey, FieldConflict>>(new Map());
  // The same set while the same sections are folded, so the card renders again only when that changes.
  const foldedRef = useRef<ReadonlySet<string>>(new Set());
  const foldedNow = foldedIds(folded);
  if (!sameIds(foldedRef.current, foldedNow)) foldedRef.current = foldedNow;
  const foldedSet = foldedRef.current;
  const sheet = useMemo(() => sheetState({ template, record, mode: 'editing', folded: foldedSet }), [template, record, foldedSet]);
  const spots = useMemo(() => editableSpots(template, sheet), [template, sheet]);
  const latest = useRef({ record, options, conflicts });
  latest.current = { record, options, conflicts };
  const refocus = useRef<string | null>(null);
  const movers = useRef(new Map<FieldKey, ListMover>());
  const [history] = useState(() => new PanelHistory());
  const sessions = usePanelSessions(app);
  const [toast, showToast] = useState<string | null>(null);
  const [addingSection, openAddSection] = useState<{ after: string | null } | null>(null);
  const unfold = useCallback((blockId: string) => setUnfolded(blockId, true), [setUnfolded]);
  const announce = useCallback((text: string) => latest.current.options.announce(text), []);
  const addSection = useAddSection({
    app, notePath, record, collectionId, writer: services.writer, entry, sessions, history, announce, toast: showToast, unfold,
  });

  useEffect(() => {
    const blockId = refocus.current;
    if (!blockId) return;
    refocus.current = null;
    cardRef.current?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)?.focus();
  });

  // A pane that can no longer write (its template is still loading, the note went) leaves no input open.
  useEffect(() => {
    if (!writable) setEditing(null);
  }, [writable]);

  const read = useCallback((field: TemplateField) => readField(latest.current.record, field), []);

  const setConflict = useCallback((key: FieldKey, conflict: FieldConflict | null): void => {
    setConflicts((previous) => {
      if (!conflict && !previous.has(key)) return previous;
      const next = new Map(previous);
      if (conflict) next.set(key, conflict);
      else next.delete(key);
      return next;
    });
  }, []);

  const write = useCallback(async (
    field: TemplateField,
    patches: readonly NotePatch[],
    edit?: { base: FieldValue | undefined; mine: FieldValue | undefined },
  ): Promise<void> => {
    const current = latest.current.options;
    if (!patches.length || !current.writable) return;
    const outcome = await services.writer.write(notePath, patches);
    if (outcome.conflicts.length) setConflict(field.key, { ...edit, canKeepMine: edit !== undefined });
    else setConflict(field.key, null);
    current.onWriteProblem(outcome.problem);
    if (outcome.applied.length) {
      history.noteChanged();
      current.onCommitted();
    }
  }, [services, notePath, setConflict, history]);

  const stop = useCallback((focus: boolean): void => {
    setEditing((target) => {
      if (focus && target) refocus.current = target.blockId;
      return null;
    });
  }, []);

  const controller = useMemo((): PaneEditController => ({
    app,
    notePath,
    collectionId,
    spots,
    sheet,
    editing,
    writable,
    record,
    conflicts,
    read,
    start: (target) => { if (latest.current.options.writable) setEditing(target); },
    stop,
    leave: (blockId) => setEditing((target) => (target?.blockId === blockId ? null : target)),
    move: (from, step) => {
      const spot = neighbourSpot(spots.order, from, step);
      if (spot) {
        setEditing({ blockId: spot.blockId, field: spot.field.key });
        return;
      }
      setEditing(null);
      latest.current.options.onExit(step);
    },
    write,
    keepMine: (field) => {
      const conflict = latest.current.conflicts.get(field.key);
      if (!conflict?.canKeepMine) return;
      const now = read(field);
      void write(field, fieldPatches(field.key, now, conflict.mine), { base: now.value, mine: conflict.mine });
    },
    keepNotes: (field) => setConflict(field.key, null),
    setPending: (commit) => { pendingCommit.current = commit; },
    releasePending: (commit) => {
      if (pendingCommit.current === commit) pendingCommit.current = null;
    },
    announce: (text) => latest.current.options.announce(text),
    moveEntry: (field, from, to) => {
      const mover = movers.current.get(field.key);
      if (mover) {
        mover(from, to);
        return;
      }
      const now = read(field);
      const patch = moveEntryToPatch(now.key, entryList(now.value), from, to);
      if (patch) void write(field, [patch]);
    },
    registerMover: (key, mover) => {
      movers.current.set(key, mover);
      return () => {
        if (movers.current.get(key) === mover) movers.current.delete(key);
      };
    },
    history,
    folded,
    foldedSet,
    setUnfolded,
    template,
    entry,
    sessions,
    addingSection,
    openAddSection,
    addSection,
    toast,
    showToast,
  }), [app, notePath, collectionId, spots, sheet, editing, writable, record, conflicts, read, stop, write, setConflict, pendingCommit, history, folded, foldedSet, setUnfolded,
    template, entry, sessions, addingSection, addSection, toast]);

  const chrome = useMemo(() => paneChrome(spots, editing, writable, controller.start), [spots, editing, writable, controller.start]);
  return { controller, chrome, valueEditing: VALUE_EDITING };
}
