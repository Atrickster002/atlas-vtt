import React from 'react';
import { blockSpec } from '../../../model/blockCatalogue';
import { coreSlotOf, type CoreSlotId } from '../../../model/coreSlots';
import { boundField } from '../../../model/treeQueries';
import { useTemplateEditor } from '../editorContext';
import { MEANING_LABELS } from '../editorGlyphs';
import { commitLabel } from '../labelCommit';
import { isUnboundBlock, labelTargetOf } from '../labelTargets';
import { boundFieldOf, editBlock, editField } from './blockEdits';
import { EntriesContent, LineFields, ScriptContent, SectionHeading, TextSource, TrackResource } from './ContentParts';
import { FieldSetting, withOwnField } from './FieldSetting';
import { isLabelled, type GroupProps } from './groupProps';
import { ChoiceSetting, SettingNote, TextSetting } from './InspectorControls';
import { KindSetting, OwnLook, ShowLabel, SizeInRow } from './lookControls';

/** The label, heading or text the block writes, as the card edits it in place. */
function LabelSetting({ block, template, session, readOnly }: GroupProps): React.JSX.Element | null {
  const { collectionKeys } = useTemplateEditor();
  const target = labelTargetOf(block, template.fields);
  if (!target || block.type === 'section' || block.type === 'text') return null;
  const label = target.kind === 'heading' || target.kind === 'text' ? 'Heading' : 'Label';
  return (
    <TextSetting
      label={label}
      value={target.kind === 'new-field' ? '' : target.text}
      placeholder={target.kind === 'new-field' ? 'Name it' : undefined}
      session={session}
      disabled={readOnly}
      // A first label names a new property: its name in notes comes from the whole label, so it is put in once.
      mode={target.kind === 'new-field' ? 'commit' : 'live'}
      onText={(text) => session.apply((current) => commitLabel(current, block.id, text, collectionKeys.keys()).template)}
    />
  );
}

/** What the Name and the token picture say in place of "Shows": they always show their own property. */
const CORE_SLOT_NOTES: Readonly<Record<CoreSlotId, string>> = {
  name: 'Shows the statblock\'s name. Every statblock has one.',
  token: 'Shows the token art. Every statblock has a place for it.',
};

/** "Shows": the property the block shows, for the blocks that show one. */
function Shows(props: GroupProps): React.JSX.Element | null {
  const { block, template, session, readOnly } = props;
  const binds = blockSpec(block.type).binds;
  const [first] = binds;
  if (!first || block.type === 'line' || block.type === 'text') return null;
  const core = coreSlotOf(template.layout, block.id);
  if (core) return <SettingNote>{CORE_SLOT_NOTES[core]}</SettingNote>;
  return (
    <FieldSetting
      label="Shows"
      value={boundField(block) || null}
      accepts={binds}
      newType={first}
      session={session}
      disabled={readOnly}
      placeholder={isUnboundBlock(block) ? 'Choose or name a property' : undefined}
      onBind={(template, chosen) => withOwnField(template, block, chosen)}
    />
  );
}

type Display = 'plain' | 'signed';

/** How numbers show and a number's unit, a line's separator: the look of the value itself. */
function ValueLook({ block, template, session, readOnly }: GroupProps): React.JSX.Element {
  const field = boundFieldOf(template, block);
  const numbers = block.type === 'stat' || block.type === 'pairs' || block.type === 'scores';
  const unit = field?.type === 'number' && (block.type === 'stat' || block.type === 'track');
  return (
    <>
      {numbers && (
        <ChoiceSetting<Display> label="Numbers" value={block.display ?? 'plain'} disabled={readOnly}
          options={[{ value: 'plain', label: '3' }, { value: 'signed', label: '+3' }]}
          onChange={(display) => editBlock(session, block.id, block.type, { display: display === 'plain' ? undefined : display })} />
      )}
      {unit && field && (
        <TextSetting label="Unit" value={field.unit ?? ''} placeholder="ft." session={session} disabled={readOnly}
          onText={(text) => editField(session, field.key, { unit: text.trim() ? text : undefined })} />
      )}
      {block.type === 'line' && (
        <TextSetting label="Between values" value={block.separator ?? ''} placeholder="A space" session={session} disabled={readOnly}
          onText={(text) => editBlock(session, block.id, 'line', { separator: text || undefined })} />
      )}
    </>
  );
}

/**
 * Settings › Basics (spec §10.2): never folded, the few plain controls of the
 * block's type: what it says and shows, and how it looks. Everything that
 * reaches a statblock's data or hides the block is under More options.
 */
export function BasicsGroup(props: GroupProps): React.JSX.Element {
  const { block, template, parent, session, readOnly } = props;
  const meaning = boundFieldOf(template, block)?.meaning;
  return (
    <section className="atlas-te-group atlas-te-group--basics" aria-label="Basics">
      <KindSetting {...props} />
      <LabelSetting {...props} />
      {block.type === 'section' && <SectionHeading {...props} block={block} />}
      {block.type === 'tabs' && <SettingNote>Each section in it is a tab, named by its heading.</SettingNote>}
      {block.type === 'text' && <TextSource {...props} block={block} />}
      {block.type === 'line' && <LineFields {...props} block={block} />}
      <Shows {...props} />
      {block.type === 'entries' && <EntriesContent {...props} block={block} />}
      {block.type === 'track' && <TrackResource {...props} block={block} />}
      {(block.type === 'script' || block.type === 'opaque') && <ScriptContent {...props} block={block} />}
      <OwnLook {...props} />
      {isLabelled(block) && <ShowLabel {...props} block={block} />}
      <ValueLook {...props} />
      {parent?.type === 'row' && <SizeInRow block={block} session={session} disabled={readOnly} />}
      {meaning && <SettingNote>Atlas reads it as {MEANING_LABELS[meaning].toLowerCase()}.</SettingNote>}
    </section>
  );
}
