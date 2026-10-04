import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { keyDependants, updateKeyDependants, type KeyDependant } from '../../../library/keyDependants';
import { renameFieldKey } from '../../../model/fieldOps';
import type { FieldKey, TemplateField, TemplateId } from '../../../model/templateTypes';
import { renameKeyInNotes, type KeyRenameResult } from '../../../notes/keyRename';
import type { EditorSession } from '../sessionTypes';

export type RenamePhase =
  | { kind: 'ready' }
  /** `total` 0: the resources and filters are being updated, before any note. */
  | { kind: 'running'; done: number; total: number }
  /** The batch ended with notes left as they were (cut short, or skipped), or something failed; `from` is the old key. */
  | { kind: 'finished'; from: FieldKey; result: KeyRenameResult | null; problem: string | null };

export interface RenameChoices {
  /** Rewrite the notes now; otherwise each moves its value when it is next edited. */
  rewriteNotes: boolean;
  updateDependants: boolean;
}

export interface KeyRenameInput {
  app: App | undefined;
  templateId: TemplateId;
  field: TemplateField;
  notes: readonly string[];
  dependants: readonly KeyDependant[];
  session: Pick<EditorSession, 'apply' | 'flush' | 'getSnapshot'>;
  announce: (text: string) => void;
  onClose: () => void;
}

const NO_DEPENDANTS: readonly KeyDependant[] = [];
const UNSAVED = 'The template couldn\'t be saved, so the notes, resources and filters were left as they are. Each note moves its value when it is next edited.';

/** The resources and filters that read a key; null while they are read. */
export function useKeyDependants(app: App | undefined, templateId: TemplateId, key: FieldKey, notes: readonly string[]): readonly KeyDependant[] | null {
  const [dependants, setDependants] = useState<readonly KeyDependant[] | null>(app ? null : NO_DEPENDANTS);
  useEffect(() => {
    if (!app) return undefined;
    let current = true;
    keyDependants(app, templateId, key, notes).then(
      (found) => { if (current) setDependants(found); },
      (error: unknown) => {
        console.error('[Atlas] Reading what uses a statblock key failed:', error);
        if (current) setDependants(NO_DEPENDANTS);
      },
    );
    return () => { current = false; };
  }, [app, templateId, key, notes]);
  return dependants;
}

function cutShort(result: KeyRenameResult): boolean {
  return result.skipped.length > 0 || result.notReached.length > 0;
}

/**
 * Renaming a key (§8.8): the template first, as one undo step, saved before
 * anything else reads the new key; then what the choices ask for, the
 * dependants and then the notes, with progress and Cancel. Closing the dialog
 * cancels the notes not reached yet; each of them keeps reading its value
 * through the former key.
 */
export function useKeyRename(input: KeyRenameInput): { phase: RenamePhase; rename: (to: FieldKey, choices: RenameChoices) => void; cancel: () => void } {
  const [phase, setPhase] = useState<RenamePhase>({ kind: 'ready' });
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  const rename = useCallback((to: FieldKey, choices: RenameChoices): void => {
    const { app, templateId, field, notes, dependants, session, announce, onClose } = latest.current;
    const from = field.key;
    session.apply((template) => renameFieldKey(template, from, to));
    // A template that took no rename (read-only meanwhile) leaves every note and dependant alone.
    if (!session.getSnapshot().template.fields.some((candidate) => candidate.key === to)) {
      onClose();
      return;
    }
    announce(`Renamed the key ${from} to ${to}.`);
    const collections = choices.updateDependants ? dependants.map((dependant) => dependant.collectionId) : [];
    const rewrite = choices.rewriteNotes ? notes : [];
    if (!app || (collections.length === 0 && rewrite.length === 0)) {
      onClose();
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const show = (next: RenamePhase): void => { if (live.current) setPhase(next); };
    show({ kind: 'running', done: 0, total: 0 });
    void (async (): Promise<void> => {
      try {
        // The template names the new key and its former keys on disk before anything reads the new key.
        await session.flush();
        if (session.getSnapshot().saveState !== 'saved') {
          show({ kind: 'finished', from, result: null, problem: UNSAVED });
          return;
        }
        if (collections.length > 0) await updateKeyDependants(app, collections, from, to);
        if (rewrite.length === 0) {
          if (live.current) onClose();
          return;
        }
        show({ kind: 'running', done: 0, total: rewrite.length });
        const result = await renameKeyInNotes(app, rewrite, { templateId, from: [from, ...(field.formerKeys ?? [])], to }, {
          signal: abort.signal,
          onProgress: (done, total) => show({ kind: 'running', done, total }),
        });
        announce(`Moved the values of ${result.renamed.length} of ${rewrite.length} statblocks to ${to}.`);
        if (cutShort(result)) show({ kind: 'finished', from, result, problem: null });
        else if (live.current) onClose();
      } catch (error) {
        console.error('[Atlas] Renaming a statblock key failed:', error);
        const reason = error instanceof Error ? error.message : String(error);
        show({ kind: 'finished', from, result: null, problem: `Couldn't finish the rename: ${reason}` });
      }
    })();
  }, []);

  const cancel = useCallback((): void => { controller.current?.abort(); }, []);

  return { phase, rename, cancel };
}
