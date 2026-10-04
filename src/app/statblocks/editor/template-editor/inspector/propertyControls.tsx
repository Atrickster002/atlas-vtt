import React, { useRef, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { isCoreSlotKey } from '../../../model/coreSlots';
import { FIELD_MEANINGS, type FieldMeaning, type TemplateField } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { MEANING_LABELS } from '../editorGlyphs';
import { useTemplateUsage } from '../useTemplateUsage';
import { withMeaning } from './blockEdits';
import { SelectSetting, Setting, SettingNote } from './InspectorControls';
import { RenameKeyDialog } from './RenameKeyDialog';

const NO_MEANING = '';

/** The property's name in notes (its key, for Dataview and Bases), and Rename… with the dialog it opens. */
export function KeySetting({ field, readOnly }: { field: TemplateField; readOnly: boolean }): React.JSX.Element {
  const { app, session, snapshot, announce } = useTemplateEditor();
  const usage = useTemplateUsage(app, snapshot.id);
  // The button the dialog opens from: its window, and where focus goes back to.
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpener(null);
    buttonRef.current?.focus();
  };
  return (
    <>
      <Setting label="Name in notes">
        {() => (
          <div className="atlas-te-setting__inline">
            <code className="atlas-te-setting__key">{field.key}</code>
            <Button ref={buttonRef} type="button" variant="ghost" size="sm" disabled={readOnly || isCoreSlotKey(field.key)} onClick={() => setOpener(buttonRef.current)}>
              Rename…
            </Button>
          </div>
        )}
      </Setting>
      {isCoreSlotKey(field.key) && <SettingNote>Every statblock keeps its {field.key === 'name' ? 'name' : 'token art'} under this name.</SettingNote>}
      {field.formerKeys && field.formerKeys.length > 0 && (
        <SettingNote>Also reads {field.formerKeys.map((key) => `“${key}”`).join(', ')} from statblocks not yet moved over.</SettingNote>
      )}
      {opener && (
        <RenameKeyDialog
          anchor={opener}
          field={field}
          template={snapshot.template}
          app={app}
          notes={usage.notes}
          session={session}
          announce={announce}
          onClose={close}
        />
      )}
    </>
  );
}

/** What Atlas reads the property as; one property per meaning, so taking one moves it here. */
export function MeaningSetting({ field, readOnly }: { field: TemplateField; readOnly: boolean }): React.JSX.Element {
  const { session, snapshot } = useTemplateEditor();
  const holders = new Map(snapshot.template.fields.filter((other) => other.meaning).map((other) => [other.meaning, other]));
  const options = [
    { value: NO_MEANING, label: 'None' },
    ...FIELD_MEANINGS.map((meaning) => {
      const holder = holders.get(meaning);
      return { value: meaning, label: MEANING_LABELS[meaning], ...(holder && holder.key !== field.key && { detail: holder.label || holder.key }) };
    }),
  ];
  return (
    <SelectSetting<string>
      label="Atlas reads it as"
      value={field.meaning ?? NO_MEANING}
      options={options}
      disabled={readOnly}
      onChange={(value) => {
        const meaning = FIELD_MEANINGS.find((candidate): candidate is FieldMeaning => candidate === value);
        session.apply((template) => withMeaning(template, field.key, meaning));
      }}
    />
  );
}
