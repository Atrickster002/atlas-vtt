import React, { useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { EditorDialog } from '../inspector/EditorDialog';
import type { NameTaken, SaveRequest, SaveSubject } from './saveChoice';
import { SaveTemplateDialog } from './SaveTemplateDialog';

export interface UnsavedChangesDialogProps {
  anchor: HTMLElement;
  subject: SaveSubject;
  taken: NameTaken;
  onSave: (request: SaveRequest) => Promise<string | null>;
  /** Back to editing: the editor opens again with the changes. */
  onKeepEditing: () => void;
  /** Saved, or Don't save: the question is answered, and the changes not saved go with it. */
  onDone: () => void;
}

/**
 * "Save changes to Marsh creature?", asked once a template editor with unsaved
 * changes has closed: Obsidian cannot keep a tab from closing, so the draft
 * waits here. Save asks for the name as the editor's Save does; Keep editing
 * (or closing the question) opens the editor again with the changes.
 */
export function UnsavedChangesDialog(props: UnsavedChangesDialogProps): React.JSX.Element {
  const { anchor, subject } = props;
  const [saving, setSaving] = useState(false);

  if (saving) {
    return (
      <SaveTemplateDialog anchor={anchor} subject={subject} taken={props.taken} onSave={props.onSave} onClose={() => setSaving(false)} onSaved={props.onDone} />
    );
  }
  return (
    <EditorDialog
      anchor={anchor}
      title={`Save changes to ${subject.name}?`}
      onClose={props.onKeepEditing}
      footer={(
        <>
          <Button type="button" variant="outline" size="sm" onClick={props.onDone}>Don&apos;t save</Button>
          <Button type="button" variant="outline" size="sm" onClick={props.onKeepEditing}>Keep editing</Button>
          <Button type="button" variant="default" size="sm" onClick={() => setSaving(true)}>Save</Button>
        </>
      )}
    >
      <p className="atlas-te-dialog__text">The template editor closed before your changes were saved.</p>
    </EditorDialog>
  );
}
