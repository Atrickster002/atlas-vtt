import React, { useId } from 'react';
import { blockSpec } from '../../../model/blockCatalogue';
import { findBlock } from '../../../model/treeQueries';
import { blockName } from '../blockNames';
import { useTemplateEditor } from '../editorContext';
import { blockGlyph } from '../editorGlyphs';
import { readOnlyMessage } from '../sessionEdit';
import { BasicsGroup } from './BasicsGroup';
import type { GroupProps } from './groupProps';
import { PropertyGroup } from './PropertyGroup';
import { VisibilityGroup } from './VisibilityGroup';
import { ThemesGroup, WriteAsGroup } from './WriteAsGroup';

/**
 * The settings of one block (spec §10.1): its glyph and name, the Basics of
 * its type in plain words, then More options, folded, each saying what is
 * set in it: Visibility, Write as, Property (what reaches every statblock's
 * value, with the reach named) and For themes.
 */
export function BlockInspector({ id, headerEnd }: { id: string; headerEnd?: React.ReactNode }): React.JSX.Element | null {
  const { session, snapshot } = useTemplateEditor();
  const titleId = useId();
  const { template } = snapshot;
  const found = findBlock(template.layout.blocks, id);
  if (!found) return null;
  const { block } = found;
  const parent = found.parentId === null ? null : findBlock(template.layout.blocks, found.parentId)?.block ?? null;
  const props: GroupProps = { block, template, session, readOnly: snapshot.readOnly, parent };
  const Glyph = blockGlyph(block.type);
  const name = blockName(block, template.fields);
  const type = blockSpec(block.type).label;
  const locked = readOnlyMessage(snapshot);
  return (
    <div className="atlas-te-insp__content" role="group" aria-labelledby={titleId}>
      <div className="atlas-te-insp__header">
        <Glyph className="atlas-te-insp__glyph" aria-hidden="true" />
        <span id={titleId} className="atlas-te-insp__name">{name}</span>
        {name !== type && <span className="atlas-te-insp__type">{type}</span>}
        {headerEnd}
      </div>
      {locked && <p className="atlas-te-insp__locked">{locked}</p>}
      <BasicsGroup {...props} />
      <p className="atlas-te-insp__more">More options</p>
      <VisibilityGroup {...props} />
      <WriteAsGroup {...props} />
      <PropertyGroup {...props} />
      <ThemesGroup {...props} />
    </div>
  );
}
