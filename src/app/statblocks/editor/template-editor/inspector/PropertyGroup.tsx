import React from 'react';
import { blockSpec } from '../../../model/blockCatalogue';
import { updateField, type FieldChanges } from '../../../model/fieldOps';
import type { FieldType } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { FIELD_TYPE_LABELS } from '../editorGlyphs';
import { useTemplateUsage } from '../useTemplateUsage';
import { boundFieldOf, editField, listFromText, sameList, textFromList } from './blockEdits';
import { EntryParts } from './EntryParts';
import { propertySummary } from './groupSummaries';
import type { GroupProps } from './groupProps';
import { InspectorGroup } from './InspectorGroup';
import { SelectSetting, SettingNote, SwitchSetting, TextSetting } from './InspectorControls';
import { KeySetting, MeaningSetting } from './propertyControls';

function statblocks(count: number): string {
  return `${count} statblock${count === 1 ? '' : 's'}`;
}

/**
 * More options › Property (spec §10.3): what the block's property holds and
 * how Atlas reads it. Its first line names the reach, since every control
 * here changes how the value reads in each statblock of the template: the
 * kind of value, its choices or scores, what each ability also has, the
 * prompt of an empty statblock, what Atlas reads it as, and its name in notes.
 */
export function PropertyGroup({ block, template, session, readOnly }: GroupProps): React.JSX.Element | null {
  const { app, snapshot } = useTemplateEditor();
  const usage = useTemplateUsage(app, snapshot.id);
  const field = boundFieldOf(template, block);
  if (!field || block.type === 'opaque') return null;
  const binds = blockSpec(block.type).binds;
  const edit = (changes: FieldChanges): void => session.apply((current) => updateField(current, field.key, changes));
  const reach = usage.notes.length;
  return (
    <InspectorGroup id="property" title="Property" summary={propertySummary(field)}>
      <SettingNote>
        {reach > 0 ? `Changes ${field.label || field.key} in ${statblocks(reach)}.` : `No statblock uses ${field.label || field.key} yet.`}
      </SettingNote>
      {binds.length > 1 && block.type !== 'line' && (
        <SelectSetting<FieldType>
          label="Kind of value"
          value={field.type}
          options={binds.map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type] }))}
          onChange={(type) => edit({ type })}
          disabled={readOnly}
        />
      )}
      {field.type === 'choice' && (
        <>
          <TextSetting label="Choices" value={textFromList(field.options)} placeholder="Small, Medium, Large" session={session} disabled={readOnly}
            onText={(text) => {
              const options = listFromText(text);
              if (!sameList(options, field.options)) edit({ options: options.length > 0 ? options : undefined });
            }} />
          <SwitchSetting label="Allow other values" value={field.open === true} onChange={(open) => edit({ open: open || undefined })} disabled={readOnly} />
        </>
      )}
      {field.type === 'scores' && (
        <TextSetting label="Labels" value={textFromList(field.slots)} placeholder="Body, Mind, Spirit" session={session} disabled={readOnly}
          onText={(text) => {
            const slots = listFromText(text);
            if (!sameList(slots, field.slots)) edit({ slots });
          }} />
      )}
      {block.type === 'entries' && <EntryParts field={field} session={session} readOnly={readOnly} />}
      <TextSetting
        label="Prompt when empty"
        value={field.prompt ?? ''}
        // Unset, a new statblock prompts with the property's label.
        placeholder={`Add ${(field.label || field.key).toLowerCase()}`}
        session={session}
        disabled={readOnly}
        onText={(text) => editField(session, field.key, { prompt: text.trim() ? text : undefined })}
      />
      <MeaningSetting field={field} readOnly={readOnly} />
      <KeySetting field={field} readOnly={readOnly} />
    </InspectorGroup>
  );
}
