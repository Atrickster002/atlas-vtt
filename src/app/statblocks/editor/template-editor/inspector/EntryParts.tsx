import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Select } from '../../../../packages/components/primitives/Select';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { fieldByKey, labelToKey } from '../../../model/fieldKeys';
import { updateField } from '../../../model/fieldOps';
import type { EntryShape, FieldKey, StatblockTemplate, TemplateField } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';
import { Setting } from './InspectorControls';
import { useGestureText } from './useGestureText';

type Extra = NonNullable<EntryShape['extras']>[number];
type ExtraType = Extra['type'];

const EXTRA_TYPES: Array<{ value: ExtraType; label: string }> = [
  { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'dice', label: 'Dice' }, { value: 'list', label: 'List' },
];

/** The template with the entries field's parts changed by `edit`, read from the field as the template holds it now. */
function withExtras(template: StatblockTemplate, key: FieldKey, edit: (extras: Extra[]) => Extra[]): StatblockTemplate {
  const field = fieldByKey(template.fields, key);
  if (!field) return template;
  const extras = edit([...(field.entry?.extras ?? [])]);
  const entry: EntryShape = { ...field.entry };
  if (extras.length > 0) entry.extras = extras;
  else delete entry.extras;
  return updateField(template, field.key, { entry: Object.keys(entry).length > 0 ? entry : undefined });
}

interface PartRowProps {
  extra: Extra;
  index: number;
  fieldKey: FieldKey;
  session: EditorSession;
  disabled: boolean;
}

function PartRow({ extra, index, fieldKey, session, disabled }: PartRowProps): React.JSX.Element {
  const labelId = useId();
  const typeId = useId();
  const change = (changes: Partial<Extra>): void => session.apply((template) =>
    withExtras(template, fieldKey, (extras) => extras.map((item, at) => (at === index ? { ...item, ...changes } : item))));
  const label = useGestureText({ value: extra.label, session, onText: (text) => { if (text.trim()) change({ label: text }); } });
  return (
    <div className="atlas-te-setting__inline">
      <span id={labelId} hidden>{`Part ${index + 1}`}</span>
      <span id={typeId} hidden>{`Type of ${extra.label}`}</span>
      <input {...label} type="text" className="atlas-te-input" aria-labelledby={labelId} disabled={disabled} spellCheck={false} />
      <Select<ExtraType> value={extra.type} options={EXTRA_TYPES} onChange={(type) => change({ type })} labelledBy={typeId} disabled={disabled} />
      <ToolButton icon={X} label="Remove" isActive={false} disabled={disabled}
        onClick={() => session.apply((template) => withExtras(template, fieldKey, (extras) => extras.filter((_, at) => at !== index)))} />
    </div>
  );
}

export interface EntryPartsProps {
  field: TemplateField;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * What each entry holds before its text (§7.5: entry extras), "Range" or
 * "Cost". A new part takes its key from its first name; renaming it later
 * keeps the key, so the statblocks keep their values.
 */
export function EntryParts({ field, session, readOnly }: EntryPartsProps): React.JSX.Element {
  const [name, setName] = useState('');
  const extras = field.entry?.extras ?? [];
  const add = (): void => {
    const label = name.trim();
    if (!label) return;
    setName('');
    session.apply((template) => withExtras(template, field.key, (current) => {
      const taken = [field.entry?.nameKey ?? 'name', field.entry?.textKey ?? 'desc', ...current.map((item) => item.key)];
      return [...current, { key: labelToKey(label, taken), label, type: 'text' }];
    }));
  };
  return (
    <Setting label="Each item also has" wide>
      {(labelId) => (
        <div className="atlas-te-setting__list">
          {extras.map((extra, index) => (
            <PartRow key={extra.key} extra={extra} index={index} fieldKey={field.key} session={session} disabled={readOnly} />
          ))}
          <input
            type="text"
            className="atlas-te-input"
            aria-labelledby={labelId}
            placeholder="Add a part, like Range"
            disabled={readOnly}
            value={name}
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              add();
            }}
          />
        </div>
      )}
    </Setting>
  );
}
