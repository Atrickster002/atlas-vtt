import React from 'react';
import { addTable } from '../../../model/lookupOps';
import { boundField } from '../../../model/treeQueries';
import type { StatblockTemplate, TemplateBlock } from '../../../model/templateTypes';
import { editBlock, withBlockChanges } from './blockEdits';
import { FieldSetting } from './FieldSetting';
import { themesSummary, writeAsSummary } from './groupSummaries';
import type { GroupProps } from './groupProps';
import { InspectorGroup } from './InspectorGroup';
import { SelectSetting, Setting, TextSetting } from './InspectorControls';
import { PatternEditor } from './PatternEditor';

const NEW_TABLE = '\u0000new';

/**
 * The template with the block's value looked up in a table after it
 * ("{cr} ({cr|lookup:xp})"); `table` NEW_TABLE makes an empty table first,
 * filled in Properties › Tables.
 */
function withLookup(template: StatblockTemplate, block: TemplateBlock, table: string): StatblockTemplate {
  const key = boundField(block);
  if (!key || !('pattern' in block)) return template;
  const made = table === NEW_TABLE ? addTable(template) : { template, name: table };
  const shown = block.pattern?.trim() || `{${key}}`;
  return withBlockChanges(made.template, block.id, block.type, { pattern: `${shown} ({${key}|lookup:${made.name}})` });
}

/**
 * More options › Write as (spec §10.3, §10.6): how a Name, Stats on one line
 * or Stat writes its values ("{hp} ({hit_dice})"), and the dice a Stat rolls.
 */
export function WriteAsGroup({ block, template, session, readOnly }: GroupProps): React.JSX.Element | null {
  const patterned = block.type === 'title' || block.type === 'line' || block.type === 'stat';
  if (!patterned) return null;
  const tables = Object.keys(template.lookups ?? {});
  return (
    <InspectorGroup id="write-as" title="Write as" summary={writeAsSummary(block)}>
      <Setting label="Write as" wide>
        {(labelId) => (
          <PatternEditor
            labelledBy={labelId}
            value={block.pattern ?? ''}
            session={session}
            disabled={readOnly}
            placeholder="Type { to add a property"
            onText={(text) => editBlock(session, block.id, block.type, { pattern: text || undefined })}
          />
        )}
      </Setting>
      {boundField(block) && (
        <SelectSetting<string>
          label="Look up in a table"
          value=""
          disabled={readOnly}
          options={[
            { value: '', label: 'Choose a table' },
            ...tables.map((name) => ({ value: name, label: name })),
            { value: NEW_TABLE, label: 'New table…' },
          ]}
          onChange={(table) => { if (table) session.apply((current) => withLookup(current, block, table)); }}
        />
      )}
      {block.type === 'stat' && (
        <FieldSetting
          label="Rolls"
          value={block.rollFrom ?? null}
          accepts={['dice']}
          newType="dice"
          session={session}
          disabled={readOnly}
          placeholder="No dice"
          onBind={(current, key) => withBlockChanges(current, block.id, 'stat', { rollFrom: key })}
          onClear={() => editBlock(session, block.id, 'stat', { rollFrom: undefined })}
        />
      )}
    </InspectorGroup>
  );
}

/** More options › For themes (spec §10.3): the class themes and Fantasy Statblocks see on the block. */
export function ThemesGroup({ block, session, readOnly }: GroupProps): React.JSX.Element | null {
  if (block.type === 'opaque') return null;
  return (
    <InspectorGroup id="themes" title="For themes" summary={themesSummary(block)}>
      <TextSetting label="Theme class" value={block.className ?? ''} placeholder="For themes" session={session} disabled={readOnly} code
        onText={(text) => editBlock(session, block.id, block.type, { className: text.trim() ? text.trim() : undefined })} />
    </InspectorGroup>
  );
}
