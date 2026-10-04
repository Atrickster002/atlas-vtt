import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { addField } from '../../../model/fieldOps';
import { fieldKeysOf, labelToKey } from '../../../model/fieldKeys';
import type { FieldType } from '../../../model/templateTypes';
import { listFromText } from '../inspector/blockEdits';
import { useTemplateEditor } from '../editorContext';
import { FIELD_TYPE_LABELS } from '../editorGlyphs';

/** The kinds a new property may hold, in the order the form offers them. */
const KINDS: readonly FieldType[] = ['text', 'number', 'choice', 'dice', 'rating', 'list', 'markdown', 'entries'];

/**
 * "+ New property" (spec §10.7): a property no block shows, for a condition
 * to decide by ("Legendary", one of Yes or No) or a formula to read. Its name
 * in notes comes from its name, past the template's own.
 */
export function NewPropertyForm(): React.JSX.Element {
  const { session, snapshot, announce } = useTemplateEditor();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldType>('text');
  const [choices, setChoices] = useState('');
  const nameId = useId();
  const kindId = useId();
  const choicesId = useId();
  const reset = (): void => {
    setOpen(false);
    setName('');
    setChoices('');
    setKind('text');
  };
  const create = (): void => {
    const label = name.trim();
    if (!label) return;
    session.apply((template) => {
      const key = labelToKey(label, fieldKeysOf(template.fields));
      const options = kind === 'choice' ? listFromText(choices) : [];
      return addField(template, { key, label, type: kind, ...(options.length > 0 && { options }) });
    });
    announce(`Added the ${label} property. No block shows it.`);
    reset();
  };

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="atlas-te-fields__new" disabled={snapshot.readOnly} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New property
      </Button>
    );
  }
  return (
    <form
      className="atlas-te-fields__form"
      aria-label="New property"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        reset();
      }}
    >
      <label htmlFor={nameId}>Name</label>
      <input id={nameId} className="atlas-te-input" value={name} autoFocus placeholder="Legendary" onChange={(event) => setName(event.target.value)} />
      <label htmlFor={kindId}>Holds</label>
      <select id={kindId} className="dropdown" value={kind} onChange={(event) => setKind(event.target.value as FieldType)}>
        {KINDS.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}
      </select>
      {kind === 'choice' && (
        <>
          <label htmlFor={choicesId}>Choices</label>
          <input id={choicesId} className="atlas-te-input" value={choices} placeholder="Yes, No" onChange={(event) => setChoices(event.target.value)} />
        </>
      )}
      <span className="atlas-te-fields__form-actions">
        <Button type="button" variant="ghost" size="sm" onClick={reset}>Cancel</Button>
        <Button type="submit" variant="outline" size="sm" disabled={!name.trim()}>Add</Button>
      </span>
    </form>
  );
}
