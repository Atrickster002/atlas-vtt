import React from 'react';
import type { ScoreColumn, ScoresBlock } from '../../model/templateTypes';
import { valueMisfit } from '../../values/valueFit';
import { valueText } from '../../values/valueText';
import { useSheet } from '../sheetContext';
import { ProblemMarker } from '../values/ProblemMarker';
import { scoreGroups, scoreSlots, type ScoreSlot } from '../values/scoreSlots';
import type { ShownText } from '../values/shownText';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

type GridStyle = React.CSSProperties & Record<`--${string}`, number>;

/** A number in a score grid; scores and modifiers are not dice to roll. */
function Cell({ shown, className }: { shown: ShownText; className: string }): React.JSX.Element {
  return (
    <span className={className}>
      {shown.text}
      {shown.problems.length > 0 && <ProblemMarker problems={shown.problems} />}
    </span>
  );
}

/** Labels over scores, each column's values in a row below ("18" over "+4"). */
function ScoresRow({ slots, columns }: { slots: readonly ScoreSlot[]; columns: readonly ScoreColumn[] }): React.JSX.Element {
  const labelled = columns.some((column) => column.label?.trim());
  const style: GridStyle = { '--atlas-sb-score-slots': slots.length };
  return (
    <div className={`atlas-sb-scores atlas-sb-scores--row${labelled ? ' atlas-sb-scores--labelled' : ''}`} style={style}>
      {labelled && <span className="atlas-sb-score-corner" />}
      {slots.map((slot, index) => <span key={`label-${index}`} className="atlas-sb-score-label">{slot.label}</span>)}
      {labelled && <span className="atlas-sb-score-corner" />}
      {slots.map((slot, index) => <Cell key={`score-${index}`} shown={slot.score} className="atlas-sb-score" />)}
      {columns.map((column, columnIndex) => (
        <React.Fragment key={`column-${columnIndex}`}>
          {labelled && <span className="atlas-sb-score-column-label">{column.label ?? ''}</span>}
          {slots.map((slot, index) => (
            <Cell key={index} shown={slot.columns[columnIndex] ?? { text: '', problems: [] }} className="atlas-sb-score-column" />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/** One group of the table: a header of column labels, then "Str 21 +5 +5" per slot. */
function ScoreGroup({ slots, columns }: { slots: readonly ScoreSlot[]; columns: readonly ScoreColumn[] }): React.JSX.Element {
  const labelled = columns.some((column) => column.label?.trim());
  return (
    <table className="atlas-sb-score-group">
      {labelled && (
        <thead>
          <tr>
            <td className="atlas-sb-score-corner" colSpan={2} />
            {columns.map((column, index) => <th key={index} scope="col" className="atlas-sb-score-column-label">{column.label ?? ''}</th>)}
          </tr>
        </thead>
      )}
      <tbody>
        {slots.map((slot, index) => (
          <tr key={`${slot.label}-${index}`}>
            <th scope="row" className="atlas-sb-score-label">{slot.label}</th>
            <td><Cell shown={slot.score} className="atlas-sb-score" /></td>
            {slot.columns.map((shown, columnIndex) => (
              <td key={columnIndex}><Cell shown={shown} className="atlas-sb-score-column" /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BLANK: ShownText = { text: '–', problems: [] };

/**
 * The grid of an empty score table while a statblock is filled in: its
 * labels over blank cells, so the card keeps its shape and says what goes
 * where (STR DEX CON…); a click on it types the scores.
 */
function blankSlots(block: ScoresBlock, labels: readonly string[]): ScoreSlot[] {
  const columns = (block.columns ?? []).map(() => BLANK);
  return labels.map((label) => ({ label, score: BLANK, columns }));
}

function ScoresContent({ block, display }: BlockViewProps<ScoresBlock>): React.JSX.Element {
  const { state } = useSheet();
  const labels = state.fields.get(block.field)?.slots ?? [];
  if (display.state === 'prompt' && labels.length > 0) return <ScoresGrid block={block} slots={blankSlots(block, labels)} />;
  if (display.state !== 'value') return <StandIn display={display} />;
  // A value that holds no scores (its field's type changed) shows as it is written.
  const field = state.fields.get(block.field);
  const value = state.reader(block.field);
  if (field && valueMisfit(field, value)) return <ValueText shown={{ text: valueText(value), problems: [] }} />;

  const slots = scoreSlots(block, state);
  if (!slots.length) return <></>;
  return <ScoresGrid block={block} slots={slots} />;
}

/** The slots as a row of labelled values, or a table of up to `perLine` groups side by side. */
function ScoresGrid({ block, slots }: { block: ScoresBlock; slots: readonly ScoreSlot[] }): React.JSX.Element {
  const columns = block.columns ?? [];
  if (block.orientation === 'row') return <ScoresRow slots={slots} columns={columns} />;
  const style: GridStyle = { '--atlas-sb-score-columns': columns.length };
  return (
    <div className="atlas-sb-scores atlas-sb-scores--table" style={style}>
      {scoreGroups(slots, block.perLine).map((group, index) => <ScoreGroup key={index} slots={group} columns={columns} />)}
    </div>
  );
}

/** Ability scores and the like: a row of labelled values, or a table of up to `perLine` groups side by side. */
export function ScoresView(props: BlockViewProps<ScoresBlock>): React.JSX.Element {
  return <ValueSlot block={props.block}><ScoresContent {...props} /></ValueSlot>;
}
