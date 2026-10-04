import React, { useContext } from 'react';
import type { EntriesBlock, EntryShape, FieldValue } from '../../model/templateTypes';
import { keyedEntryItems } from '../../values/entryKeys';
import { entryExtras, entryName, entryText } from '../../values/entryValues';
import { valueText } from '../../values/valueText';
import { EntryLine } from '../shared/EntryLine';
import { useSheet } from '../sheetContext';
import { SheetHeading } from '../values/SheetHeading';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/** An entry's labelled parts before its text: "Range 30 ft. Cost 2". */
function EntryExtras({ entry, shape }: { entry: FieldValue; shape: EntryShape | undefined }): React.JSX.Element | null {
  const extras = entryExtras(entry, shape);
  if (!extras.length) return null;
  return (
    <span className="atlas-sb-entry-extras">
      {extras.map((extra) => (
        <span key={extra.key} className="atlas-sb-entry-extra">
          <span className="atlas-sb-entry-extra-label">{extra.label}</span> {valueText(extra.value)}
        </span>
      ))}
    </span>
  );
}

/** A list of traits or actions under its heading: "***Claws.*** Melee Attack Roll: +5…". */
export function EntriesView({ block, display }: BlockViewProps<EntriesBlock>): React.JSX.Element {
  const { state, app, sourcePath } = useSheet();
  const editing = useContext(ValueEditingContext);
  const shape = state.fields.get(block.field)?.entry;
  const entries = display.state === 'value' ? keyedEntryItems(state.reader(block.field)) : [];
  const intro = block.introField && display.state === 'value' ? valueText(state.reader(block.introField)) : '';

  return (
    <div className="atlas-sb-entries">
      {block.heading?.trim() && <SheetHeading>{block.heading}</SheetHeading>}
      {intro.trim() && (
        <div className="atlas-sb-entries-intro">
          <ValueText shown={{ text: intro, problems: [] }} />
        </div>
      )}
      <ValueSlot block={block}>
        {display.state !== 'value' && <StandIn display={display} />}
        {entries.map(({ item, key, index }, shown) => {
          const line = (
            <EntryLine
              itemKey={key}
              itemIndex={index}
              name={entryName(item, shape)}
              text={entryText(item, shape) ?? ''}
              app={app}
              sourcePath={sourcePath}
              nameStyle={block.nameStyle ?? 'run-in'}
            >
              <EntryExtras entry={item} shape={shape} />
            </EntryLine>
          );
          return <React.Fragment key={key}>{editing?.entry ? editing.entry(block, { item, key, index, shown }, line) : line}</React.Fragment>;
        })}
      </ValueSlot>
    </div>
  );
}
