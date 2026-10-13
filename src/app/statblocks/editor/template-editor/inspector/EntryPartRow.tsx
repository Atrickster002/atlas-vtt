import React, { useId } from 'react';
import { X } from 'lucide-react';
import { Select } from '../../../../packages/components/primitives/Select';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import type { EntryExtraShape, EntryExtraType } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';
import { listFromText, sameList, textFromList } from './blockEdits';
import { SwitchSetting, TextSetting } from './InspectorControls';
import { useGestureText } from './useGestureText';

const EXTRA_TYPES: Array<{ value: EntryExtraType; label: string }> = [
  { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'dice', label: 'Dice' },
  { value: 'list', label: 'List' }, { value: 'choice', label: 'One of a list' },
];

/** The part as another type: what only a choice has goes when it is no choice any more. */
function retyped(extra: EntryExtraShape, type: EntryExtraType): EntryExtraShape {
  if (type === 'choice') return { ...extra, type };
  const { options: _options, several: _several, ...rest } = extra;
  return { ...rest, type };
}

function withOptions(extra: EntryExtraShape, options: string[]): EntryExtraShape {
  const { options: _options, ...rest } = extra;
  return options.length > 0 ? { ...rest, options } : rest;
}

function withSeveral(extra: EntryExtraShape, several: boolean): EntryExtraShape {
  const { several: _several, ...rest } = extra;
  return several ? { ...rest, several } : rest;
}

export interface EntryPartRowProps {
  extra: EntryExtraShape;
  index: number;
  session: EditorSession;
  disabled: boolean;
  /** Changes the part as the template holds it now, one undo step. */
  onEdit: (edit: (current: EntryExtraShape) => EntryExtraShape) => void;
  onRemove: () => void;
}

/**
 * One part of every ability: its name, its type and Remove. A part that is one
 * of a list ("Main action", "Reaction", "Passive") has its options under it,
 * typed as one line, and whether an ability may pick several of them.
 */
export function EntryPartRow({ extra, index, session, disabled, onEdit, onRemove }: EntryPartRowProps): React.JSX.Element {
  const labelId = useId();
  const typeId = useId();
  const label = useGestureText({ value: extra.label, session, onText: (text) => { if (text.trim()) onEdit((current) => ({ ...current, label: text })); } });
  return (
    <div className="atlas-te-entry-part">
      <div className="atlas-te-setting__inline">
        <span id={labelId} hidden>{`Part ${index + 1}`}</span>
        <span id={typeId} hidden>{`Type of ${extra.label}`}</span>
        <input {...label} type="text" className="atlas-te-input" aria-labelledby={labelId} disabled={disabled} spellCheck={false} />
        <Select<EntryExtraType> value={extra.type} options={EXTRA_TYPES} onChange={(type) => onEdit((current) => retyped(current, type))} labelledBy={typeId} disabled={disabled} />
        <ToolButton icon={X} label="Remove" isActive={false} disabled={disabled} onClick={onRemove} />
      </div>
      {extra.type === 'choice' && (
        <div className="atlas-te-entry-part__choice">
          <TextSetting
            label="Choices"
            value={textFromList(extra.options)}
            placeholder="Main action, Reaction, Passive"
            session={session}
            disabled={disabled}
            onText={(text) => {
              const options = listFromText(text);
              if (!sameList(options, extra.options)) onEdit((current) => withOptions(current, options));
            }}
          />
          <SwitchSetting
            label="Pick several"
            value={extra.several === true}
            disabled={disabled}
            onChange={(several) => onEdit((current) => withSeveral(current, several))}
          />
        </div>
      )}
    </div>
  );
}
