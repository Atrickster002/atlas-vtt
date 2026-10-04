import React, { useState } from 'react';
import type { ConflictChoice } from '../../library/TemplateSession';
import { EditorBar } from './EditorBar';
import type { EditorSession, SessionSnapshot } from './sessionTypes';

/**
 * What happened to the file while the editor held unsaved changes (§8.7):
 * changed elsewhere (another device, git) or deleted. The editor writes
 * nothing until one of the choices is made.
 */
export function ConflictBar({ session, snapshot }: { session: EditorSession; snapshot: SessionSnapshot }): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  if (!snapshot.conflict) return null;

  const choose = (choice: ConflictChoice): void => {
    setBusy(true);
    void session.resolveConflict(choice).finally(() => setBusy(false));
  };
  const text = snapshot.conflict === 'deleted'
    ? 'This template’s file was deleted while you were editing it.'
    : 'This template was changed somewhere else while you were editing it.';
  const actions = snapshot.conflict === 'deleted'
    ? [
      { label: 'Recreate it', primary: true, disabled: busy, onClick: () => choose('recreate') },
      { label: 'Save as a copy', disabled: busy, onClick: () => choose('save-copy') },
    ]
    : [
      { label: 'Keep mine', primary: true, disabled: busy, onClick: () => choose('keep-mine') },
      { label: 'Use the other', disabled: busy, onClick: () => choose('use-other') },
      { label: 'Save mine as a copy', disabled: busy, onClick: () => choose('save-copy') },
    ];

  return (
    <EditorBar tone="warning" text={text} actions={actions}>
      {snapshot.saveProblem && <p className="atlas-te-bar__detail">{snapshot.saveProblem}</p>}
    </EditorBar>
  );
}
