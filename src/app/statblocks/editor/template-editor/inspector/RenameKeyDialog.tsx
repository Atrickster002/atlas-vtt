import React, { useEffect, useId, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { renameKeyProblem } from '../../../model/fieldOps';
import type { StatblockTemplate, TemplateField } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';
import { EditorDialog } from './EditorDialog';
import { AffectedNotes, DependantsChoice, NoteChoice, RenameProgress, RenameSummary } from './RenameKeyParts';
import { useKeyDependants, useKeyRename, type RenamePhase } from './useKeyRename';
import './rename-key-dialog.scss';

export interface RenameKeyDialogProps {
  /** An element of the editor: the dialog opens in its window. */
  anchor: HTMLElement;
  field: TemplateField;
  template: StatblockTemplate;
  /** The vault; without one there are no notes or dependants to update. */
  app: App | undefined;
  /** The statblocks that use the template. */
  notes: readonly string[];
  session: Pick<EditorSession, 'apply' | 'flush' | 'getSnapshot'>;
  /** Says what happened in the editor's live region. */
  announce: (text: string) => void;
  onClose: () => void;
}

interface FooterProps {
  phase: RenamePhase;
  canRename: boolean;
  onRename: () => void;
  onCancel: () => void;
  onClose: () => void;
}

function Footer({ phase, canRename, onRename, onCancel, onClose }: FooterProps): React.JSX.Element {
  if (phase.kind === 'running') return <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>;
  if (phase.kind === 'finished') return <Button type="button" size="sm" onClick={onClose}>Done</Button>;
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      <Button type="button" size="sm" disabled={!canRename} onClick={onRename}>Rename</Button>
    </>
  );
}

/**
 * Rename key (§7.10, §8.8): the key the statblocks store the field under. The
 * template renames at once, one undo step, and goes on reading the old key as
 * a former key, so no value is lost. The notes that use the template are
 * rewritten now, as a batch with progress and Cancel, or each when it is next
 * edited; the resources and creature filters that read the key can follow.
 */
export function RenameKeyDialog({ anchor, field, template, app, notes, session, announce, onClose }: RenameKeyDialogProps): React.JSX.Element {
  const inputId = useId();
  const problemId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(field.key);
  const [rewriteNotes, setRewriteNotes] = useState(true);
  const [updateDependants, setUpdateDependants] = useState(true);
  const dependants = useKeyDependants(app, template.id, field.key, notes);
  const { phase, rename, cancel } = useKeyRename({
    app, templateId: template.id, field, notes, dependants: dependants ?? [], session, announce, onClose,
  });
  const to = key.trim();
  const changed = to !== field.key;
  const problem = changed ? renameKeyProblem(template, field.key, to) : null;
  const canRename = changed && problem === null && dependants !== null;

  useEffect(() => { inputRef.current?.select(); }, []);

  const confirm = (): void => {
    if (canRename && phase.kind === 'ready') rename(to, { rewriteNotes, updateDependants });
  };
  // Closing while notes are rewritten stops at the next note: those not reached keep the old key.
  const close = (): void => {
    cancel();
    onClose();
  };

  return (
    <EditorDialog
      anchor={anchor}
      title="Rename key"
      onClose={close}
      footer={<Footer phase={phase} canRename={canRename} onRename={confirm} onCancel={cancel} onClose={close} />}
    >
      <p className="atlas-te-dialog__text">
        Statblocks store {field.label || field.key} under this key. The old key stays readable, so no value is lost.
      </p>
      <div className="atlas-te-dialog__field">
        <label htmlFor={inputId} className="atlas-te-dialog__label">New key</label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="atlas-te-input atlas-te-input--code"
          value={key}
          spellCheck={false}
          autoComplete="off"
          disabled={phase.kind !== 'ready'}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            confirm();
          }}
        />
        {problem && <p id={problemId} className="atlas-te-setting__problem">{problem}</p>}
      </div>
      {phase.kind === 'ready' && notes.length > 0 && (
        <div className="atlas-te-rename__section">
          <AffectedNotes notes={notes} />
          <NoteChoice count={notes.length} rewrite={rewriteNotes} onChange={setRewriteNotes} />
        </div>
      )}
      {phase.kind === 'ready' && dependants !== null && dependants.length > 0 && (
        <DependantsChoice dependants={dependants} update={updateDependants} onChange={setUpdateDependants} />
      )}
      {phase.kind === 'running' && <RenameProgress done={phase.done} total={phase.total} />}
      {phase.kind === 'finished' && <RenameSummary result={phase.result} problem={phase.problem} from={phase.from} />}
    </EditorDialog>
  );
}
