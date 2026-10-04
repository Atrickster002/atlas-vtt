import React from 'react';
import { X } from 'lucide-react';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import type { FieldKey, FieldType, StatblockTemplate, TemplateBlock } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import type { EditorSession } from '../sessionTypes';
import { withBlockChanges } from './blockEdits';
import { withChosenField } from './fieldChoices';
import { FieldPicker } from './FieldPicker';
import { Setting } from './InspectorControls';

export interface FieldSettingProps {
  label?: string | undefined;
  /** The field shown there now. */
  value: FieldKey | null;
  /** The types the place takes; null takes any. */
  accepts: readonly FieldType[] | null;
  /** The type a field new to the template gets. */
  newType: FieldType;
  session: EditorSession;
  disabled: boolean;
  /** Offers the collection's keys and new fields. */
  allowNew?: boolean | undefined;
  placeholder?: string | undefined;
  /** Shows the chosen field there, in the template that already holds it. */
  onBind: (template: StatblockTemplate, key: FieldKey) => StatblockTemplate;
  /** For a place that may show none: takes the field away again. */
  onClear?: (() => void) | undefined;
}

/**
 * A place that shows a property, with the property picker; one step adds a
 * property the template lacks and shows it. Where the collection's statblocks
 * have values of it, it says how many: that is how they keep their data.
 */
export function FieldSetting(props: FieldSettingProps): React.JSX.Element {
  const { label = 'Property', value, accepts, newType, session, disabled, allowNew = true, placeholder, onBind, onClear } = props;
  const { collectionKeys } = useTemplateEditor();
  const used = value ? collectionKeys.get(value) : undefined;
  return (
    <Setting label={label}>
      {(labelId) => (
        <>
          <div className="atlas-te-setting__inline">
            <FieldPicker
              labelledBy={labelId}
              value={value}
              accepts={accepts}
              allowNew={allowNew}
              disabled={disabled}
              placeholder={placeholder}
              onPick={(choice) => session.apply((template) => {
                const chosen = withChosenField(template, choice, newType);
                return chosen ? onBind(chosen.template, chosen.key) : template;
              })}
            />
            {onClear && value && <ToolButton icon={X} label="Clear" isActive={false} disabled={disabled} onClick={onClear} />}
          </div>
          {used !== undefined && (
            <span className="atlas-te-setting__hint">
              {used === 1 ? 'In 1 statblock of this collection.' : `In ${used} statblocks of this collection.`}
            </span>
          )}
        </>
      )}
    </Setting>
  );
}

/** The template with a block showing `key` as its own field. */
export function withOwnField(template: StatblockTemplate, block: TemplateBlock, key: FieldKey): StatblockTemplate {
  switch (block.type) {
    case 'title': return withBlockChanges(template, block.id, 'title', { field: key });
    case 'stat': return withBlockChanges(template, block.id, 'stat', { field: key });
    case 'scores': return withBlockChanges(template, block.id, 'scores', { field: key });
    case 'tags': return withBlockChanges(template, block.id, 'tags', { field: key });
    case 'text': return withBlockChanges(template, block.id, 'text', { field: key });
    case 'entries': return withBlockChanges(template, block.id, 'entries', { field: key });
    case 'pairs': return withBlockChanges(template, block.id, 'pairs', { field: key });
    case 'track': return withBlockChanges(template, block.id, 'track', { field: key });
    case 'image': return withBlockChanges(template, block.id, 'image', { field: key });
    case 'spells': return withBlockChanges(template, block.id, 'spells', { field: key });
    default: return template;
  }
}
