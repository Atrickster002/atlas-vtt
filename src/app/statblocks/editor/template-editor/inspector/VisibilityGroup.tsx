import React from 'react';
import { editBlock } from './blockEdits';
import { ConditionBuilder } from './ConditionBuilder';
import { visibilitySummary } from './groupSummaries';
import { canBeEmpty, type GroupProps } from './groupProps';
import { InspectorGroup } from './InspectorGroup';
import { ChoiceSetting, Setting } from './InspectorControls';
import { PatternEditor } from './PatternEditor';

/**
 * More options › Visibility (spec §10.3): what shows while the block has no
 * value (nothing, or a text, which may work a value out of other
 * properties), and "Show only when" another property says so.
 */
export function VisibilityGroup({ block, template, session, readOnly }: GroupProps): React.JSX.Element | null {
  if (block.type === 'opaque') return null;
  const empty = canBeEmpty(block);
  const mode = block.whenEmpty === 'fallback' ? 'fallback' : 'hide';
  return (
    <InspectorGroup id="visibility" title="Visibility" summary={visibilitySummary(block, template)}>
      {empty && (
        <ChoiceSetting
          label="With no value"
          value={mode}
          options={[{ value: 'hide', label: 'Hide' }, { value: 'fallback', label: 'Show text' }]}
          disabled={readOnly}
          onChange={(next) => editBlock(session, block.id, block.type, { whenEmpty: next === 'fallback' ? 'fallback' : undefined })}
        />
      )}
      {empty && mode === 'fallback' && (
        <Setting label="Text shown" wide>
          {(labelId) => (
            <PatternEditor
              labelledBy={labelId}
              value={block.fallback ?? ''}
              session={session}
              disabled={readOnly}
              placeholder="What shows instead"
              onText={(text) => editBlock(session, block.id, block.type, { fallback: text || undefined })}
            />
          )}
        </Setting>
      )}
      {block.type !== 'script' && <ConditionBuilder block={block} session={session} disabled={readOnly} />}
    </InspectorGroup>
  );
}
