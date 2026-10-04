import React from 'react';
import { blockSpec, primitiveOf, rowSizeOf, type AuthorableBlockType } from '../../../model/blockCatalogue';
import { coreSlotOf } from '../../../model/coreSlots';
import { turnInto } from '../../../model/turnInto';
import { wordsStandAlone, type TagsBlock, type TemplateBlock } from '../../../model/templateTypes';
import { boundFieldOf, editBlock } from './blockEdits';
import type { GroupProps, LabelledBlock } from './groupProps';
import { ChoiceSetting, SelectSetting, SwitchSetting } from './InspectorControls';
import { ScoreColumns } from './ScoreColumns';
import { applyTree } from '../sessionEdit';
import type { EditorSession } from '../sessionTypes';

/** Slots side by side in a Scores table. */
const PER_LINE = ['1', '2', '3', '4', '5', '6'] as const;

/** How a list of words shows, in the inspector and the block menu's quick choice. */
export const TAG_LOOK_OPTIONS: ReadonlyArray<{ value: TagsBlock['look']; label: string }> = [
  { value: 'comma', label: 'Comma list' }, { value: 'chips', label: 'Chips' },
  { value: 'bullets', label: 'Bullets' }, { value: 'numbered', label: 'Numbered' },
];

/**
 * Whether a labelled block shows its label. An empty label hides it; words
 * that stand on their own show one only where the template gives one (`TagsView`).
 */
function labelShown(block: LabelledBlock): boolean {
  if (wordsStandAlone(block)) return Boolean(block.label);
  return block.label !== '';
}

export function ShowLabel({ block, template, session, readOnly }: GroupProps & { block: LabelledBlock }): React.JSX.Element {
  const toggle = (show: boolean): void => {
    const alone = wordsStandAlone(block);
    const fieldLabel = boundFieldOf(template, block)?.label;
    const label = show ? (alone ? fieldLabel ?? block.field : undefined) : (alone ? undefined : '');
    editBlock(session, block.id, block.type, { label });
  };
  return <SwitchSetting label="Show label" value={labelShown(block)} onChange={toggle} disabled={readOnly} />;
}

/**
 * A primitive's kind: whether a Heading's text is typed or comes from a
 * property, what a List's items are. Choosing one turns the block into that
 * type in one step, keeping what the two share.
 */
export function KindSetting({ block, template, session, readOnly }: GroupProps): React.JSX.Element | null {
  const primitive = primitiveOf(block.type);
  if (!primitive?.kindSetting || coreSlotOf(template.layout, block.id)) return null;
  const current = primitive.kinds.find((type) => type === block.type);
  if (!current) return null;
  const options = primitive.kinds.map((type) => ({ value: type, label: blockSpec(type).kind ?? blockSpec(type).label }));
  const turn = (type: AuthorableBlockType): void => {
    applyTree(session, (layout, template) => turnInto(layout, block.id, type, template.fields));
  };
  return options.length > 2
    ? <SelectSetting label={primitive.kindSetting} value={current} options={options} disabled={readOnly} onChange={turn} />
    : <ChoiceSetting label={primitive.kindSetting} value={current} options={options} disabled={readOnly} onChange={turn} />;
}

/** The settings of the block's own look, by type. */
export function OwnLook(props: GroupProps): React.JSX.Element | null {
  const { block, session, readOnly: disabled } = props;
  switch (block.type) {
    case 'title':
      return <ChoiceSetting label="Size" value={String(block.level) as '1' | '2' | '3'} disabled={disabled}
        options={[{ value: '1', label: 'Large' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Small' }]}
        onChange={(level) => editBlock(session, block.id, 'title', { level: Number(level) as 1 | 2 | 3 })} />;
    case 'stat':
      return <ChoiceSetting label="Style" value={block.look} disabled={disabled}
        options={[{ value: 'run-in', label: 'Label first' }, { value: 'stacked', label: 'Label above' }]}
        onChange={(look) => editBlock(session, block.id, 'stat', { look })} />;
    case 'tags':
      return <SelectSetting label="Style" value={block.look} disabled={disabled} options={[...TAG_LOOK_OPTIONS]}
        onChange={(look) => editBlock(session, block.id, 'tags', { look })} />;
    case 'track':
      return (
        <>
          <ChoiceSetting label="Style" value={block.look} disabled={disabled}
            options={[{ value: 'boxes', label: 'Boxes' }, { value: 'gauge', label: 'Gauge' }]}
            onChange={(look) => editBlock(session, block.id, 'track', { look })} />
          <ChoiceSetting label="Counts" value={block.counts} disabled={disabled}
            options={[{ value: 'down', label: 'Down' }, { value: 'up', label: 'Up' }]}
            onChange={(counts) => editBlock(session, block.id, 'track', { counts })} />
        </>
      );
    case 'scores':
      return (
        <>
          <ChoiceSetting label="Layout" value={block.orientation} disabled={disabled}
            options={[{ value: 'row', label: 'Labels on top' }, { value: 'table', label: 'Labels at the side' }]}
            onChange={(orientation) => editBlock(session, block.id, 'scores', { orientation })} />
          {block.orientation === 'table' && (
            <SelectSetting label="Per line" value={String(block.perLine ?? 1)} disabled={disabled}
              options={PER_LINE.map((count) => ({ value: count, label: `${count} per line` }))}
              onChange={(count) => editBlock(session, block.id, 'scores', { perLine: count === '1' ? undefined : Number(count) })} />
          )}
          <ScoreColumns {...props} block={block} />
        </>
      );
    case 'entries':
      return <ChoiceSetting label="Names" value={block.nameStyle ?? 'run-in'} disabled={disabled}
        options={[{ value: 'run-in', label: 'Run-in' }, { value: 'heading', label: 'As headings' }]}
        onChange={(nameStyle) => editBlock(session, block.id, 'entries', { nameStyle: nameStyle === 'run-in' ? undefined : nameStyle })} />;
    case 'spells':
      return <ChoiceSetting label="Levels" value={block.look ?? 'lines'} disabled={disabled}
        options={[{ value: 'lines', label: 'Lines' }, { value: 'tabs', label: 'Tabs' }]}
        onChange={(look) => editBlock(session, block.id, 'spells', { look: look === 'lines' ? undefined : look })} />;
    case 'image':
      return <ChoiceSetting label="Shape" value={block.shape} disabled={disabled}
        options={[{ value: 'token', label: 'Token' }, { value: 'portrait', label: 'Portrait' }]}
        onChange={(shape) => editBlock(session, block.id, 'image', { shape })} />;
    case 'heading':
      return <ChoiceSetting label="Size" value={block.level} disabled={disabled}
        options={[{ value: 'section', label: 'Section' }, { value: 'minor', label: 'Minor' }]}
        onChange={(level) => editBlock(session, block.id, 'heading', { level })} />;
    case 'section':
      return <ChoiceSetting label="Folds" value={block.collapsible ?? 'no'} disabled={disabled}
        options={[{ value: 'no', label: 'No' }, { value: 'open', label: 'Starts open' }, { value: 'closed', label: 'Starts closed' }]}
        onChange={(fold) => editBlock(session, block.id, 'section', { collapsible: fold === 'no' ? undefined : fold })} />;
    case 'row':
      return <ChoiceSetting label="Align" value={block.align ?? 'start'} disabled={disabled}
        options={[{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'spread', label: 'Spread' }]}
        onChange={(align) => editBlock(session, block.id, 'row', { align: align === 'start' ? undefined : align })} />;
    default:
      return null;
  }
}

/** Inside a Row: whether the block takes the width it needs or shares what is left. */
export function SizeInRow({ block, session, disabled }: { block: TemplateBlock; session: EditorSession; disabled: boolean }): React.JSX.Element {
  return <ChoiceSetting label="Width in the row" value={rowSizeOf(block)} disabled={disabled}
    options={[{ value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill' }]}
    onChange={(size) => editBlock(session, block.id, block.type, { size })} />;
}
