/** The Basics that only some blocks have (§10.2): a heading's source, a list's name for one ability, a track's resource. */

import React, { useMemo, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { collectionResources } from '../../../../resources/collectionResources';
import { AssetService } from '../../../../services/AssetService';
import { trackScripts, withTrackBlocks } from '../../../fs/fsTrackReplacement';
import { createBlock, PRIMITIVE_IDS, PRIMITIVES, type AuthorableBlockType } from '../../../model/blockCatalogue';
import { blockIdSource } from '../../../model/templateIds';
import { refuse } from '../../../model/treeEdit';
import { insertBlock, removeBlock } from '../../../model/treeOps';
import { collectBlockIds, findBlock } from '../../../model/treeQueries';
import type { EntriesBlock, OpaqueBlock, ScriptBlock, SectionBlock, TextBlock, TrackBlock } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { applyEdit, applyTree, chainTree } from '../sessionEdit';
import { editBlock, withBlockChanges } from './blockEdits';
import { FieldSetting, withOwnField } from './FieldSetting';
import type { GroupProps } from './groupProps';
import { ChoiceSetting, SelectSetting, SettingNote, TextSetting } from './InspectorControls';

export { LineFields } from './LineFields';

type PartProps<B> = GroupProps & { block: B };

/** A Section's heading: written in the template, or read from a field of the statblock. */
export function SectionHeading({ block, session, readOnly }: PartProps<SectionBlock>): React.JSX.Element {
  const [source, setSource] = useState<'text' | 'field'>(block.headingField ? 'field' : 'text');
  return (
    <>
      <ChoiceSetting
        label="Heading"
        value={source}
        options={[{ value: 'text', label: 'Written here' }, { value: 'field', label: 'From a property' }]}
        disabled={readOnly}
        onChange={(next) => {
          setSource(next);
          if (next === 'text') editBlock(session, block.id, 'section', { headingField: undefined });
        }}
      />
      {source === 'text' ? (
        <TextSetting label="Text" value={block.heading ?? ''} session={session} disabled={readOnly}
          onText={(text) => editBlock(session, block.id, 'section', { heading: text.trim() ? text : undefined })} />
      ) : (
        <FieldSetting label="Property" value={block.headingField ?? null} accepts={['text', 'choice']} newType="text"
          session={session} disabled={readOnly}
          onBind={(template, key) => withBlockChanges(template, block.id, 'section', { headingField: key })} />
      )}
    </>
  );
}

/** A Text block's heading, and whether it shows a field of the statblock or text written in the template. */
export function TextSource({ block, session, readOnly }: PartProps<TextBlock>): React.JSX.Element {
  const [source, setSource] = useState<'field' | 'text'>(block.field || !block.text ? 'field' : 'text');
  return (
    <>
      <TextSetting label="Heading" value={block.heading ?? ''} session={session} disabled={readOnly}
        onText={(text) => editBlock(session, block.id, 'text', { heading: text.trim() ? text : undefined })} />
      <ChoiceSetting
        label="Shows"
        value={source}
        options={[{ value: 'field', label: 'A property' }, { value: 'text', label: 'Fixed text' }]}
        disabled={readOnly}
        onChange={(next) => {
          setSource(next);
          if (next === 'text') editBlock(session, block.id, 'text', { field: undefined });
        }}
      />
      {source === 'field' ? (
        <FieldSetting label="Property" value={block.field || null} accepts={['markdown']} newType="markdown" session={session} disabled={readOnly}
          onBind={(template, key) => withOwnField(template, block, key)} />
      ) : (
        <TextSetting label="Text" value={block.text ?? ''} session={session} disabled={readOnly} multiline
          onText={(text) => editBlock(session, block.id, 'text', { text: text || undefined })} />
      )}
    </>
  );
}

/** "Add action" ↔ "action": what one ability of the list is called, as its prompt and menus say it. */
export function calledFromAddLabel(addLabel: string | undefined): string {
  return addLabel?.trim().replace(/^add\s+(an?\s+)?/i, '') ?? '';
}

/** A list's name for one of its abilities, and the text before the list. */
export function EntriesContent(props: PartProps<EntriesBlock>): React.JSX.Element {
  const { block, session, readOnly } = props;
  return (
    <>
      <TextSetting label="Each one is called" value={calledFromAddLabel(block.addLabel)} placeholder="item" session={session} disabled={readOnly}
        onText={(text) => editBlock(session, block.id, 'entries', { addLabel: text.trim() ? `Add ${text.trim().toLowerCase()}` : undefined })} />
      <FieldSetting label="Text before the list" value={block.introField ?? null} accepts={['markdown', 'text']} newType="markdown"
        session={session} disabled={readOnly}
        onBind={(current, key) => withBlockChanges(current, block.id, 'entries', { introField: key })}
        onClear={() => editBlock(session, block.id, 'entries', { introField: undefined })} />
    </>
  );
}

/** The token resource a Track shows on a token's statblock, from the collection's resources. */
export function TrackResource({ block, session, readOnly }: PartProps<TrackBlock>): React.JSX.Element {
  const { app, collectionId } = useTemplateEditor();
  const resources = useMemo(
    () => (app && collectionId ? collectionResources(AssetService.getInstance(app).getCollectionSettings(collectionId)) : []),
    [app, collectionId],
  );
  const options = [
    { value: '', label: 'None' },
    ...resources.map((resource) => ({ value: resource.key, label: resource.name })),
    ...(block.resource && !resources.some((resource) => resource.key === block.resource) ? [{ value: block.resource, label: block.resource }] : []),
  ];
  return (
    <SelectSetting label="Counts from" value={block.resource ?? ''} options={options} disabled={readOnly}
      onChange={(resource) => editBlock(session, block.id, 'track', { resource: resource || undefined })} />
  );
}

const CHOOSE = '';

/** A preserved Fantasy Statblocks script, or a block of a newer Atlas: what it is, and a block to put in its place. */
export function ScriptContent({ block, template, session, readOnly }: PartProps<ScriptBlock | OpaqueBlock>): React.JSX.Element {
  const { select } = useTemplateEditor();
  const drawsTracks = useMemo(() => trackScripts(template).some((script) => script.id === block.id), [template, block.id]);
  // The Track blocks the import report offers for this one script, with the fields they show; one step.
  const replaceWithTracks = (): void => {
    const inserted = applyEdit(session, (current) => {
      const next = withTrackBlocks(current, [block.id]);
      const before = collectBlockIds(current.layout.blocks);
      return { template: next, result: [...collectBlockIds(next.layout.blocks)].filter((id) => !before.has(id)) };
    });
    if (inserted && inserted.length > 0) select(inserted, false);
  };
  const replace = (type: AuthorableBlockType): void => {
    const out: { inserted: string | null } = { inserted: null };
    applyTree(session, (layout) => {
      const found = findBlock(layout.blocks, block.id);
      if (!found) return refuse(layout, 'block-not-found');
      const next = createBlock(type, blockIdSource(collectBlockIds(layout.blocks)));
      out.inserted = next.id;
      return chainTree(layout, [
        (current) => removeBlock(current, block.id),
        (current) => insertBlock(current, next, { parentId: found.parentId, index: found.index }),
      ]);
    });
    if (out.inserted) select([out.inserted], false);
  };
  return (
    <>
      <SettingNote>
        {block.type === 'script'
          ? `${block.summary || 'A script from Fantasy Statblocks'}. Atlas keeps it for Fantasy Statblocks and shows a placeholder.`
          : 'This block comes from a newer Atlas. It is kept as it is.'}
      </SettingNote>
      {drawsTracks && (
        <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={replaceWithTracks}>
          Replace with Track blocks
        </Button>
      )}
      {block.type === 'script' && (
        <SelectSetting<string>
          label="Replace with"
          value={CHOOSE}
          options={[{ value: CHOOSE, label: 'Choose a block' }, ...PRIMITIVE_IDS.map((id) => ({ value: id, label: PRIMITIVES[id].label }))]}
          disabled={readOnly}
          onChange={(id) => {
            const chosen = PRIMITIVE_IDS.find((candidate) => candidate === id);
            if (chosen) replace(PRIMITIVES[chosen].inserts);
          }}
        />
      )}
    </>
  );
}
