import React from 'react';
import { GripHorizontal, GripVertical, Plus } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { chromeButtonProps } from '../interaction/chrome';
import type { DropLine, TableAxis } from './TableDrag';

/** Marks a row's or column's handle with its axis; `data-index` holds its place. */
export const TABLE_HANDLE_ATTRIBUTE = 'data-table-handle';

export interface HandleProps {
  axis: TableAxis;
  index: number;
  /** The row or column is selected (pressed, dragged or picked from its handle). */
  selected: boolean;
  onPress: (axis: TableAxis, index: number, event: React.PointerEvent<HTMLButtonElement>) => void;
}

/**
 * A row's handle at its left edge, or a column's at its top, as Obsidian's:
 * seen while pointed at; a press selects the row or column, a drag moves it,
 * a right-click opens its menu. Chrome: it never takes focus.
 */
export function TableHandle({ axis, index, selected, onPress }: HandleProps): React.JSX.Element {
  const Grip = axis === 'row' ? GripVertical : GripHorizontal;
  return (
    <button
      {...chromeButtonProps()}
      className={`atlas-sb-sheet-table__handle atlas-sb-sheet-table__handle--${axis}`}
      aria-label={axis === 'row' ? `Row ${index + 1}` : `Column ${index + 1}`}
      data-selected={selected || undefined}
      {...{ [TABLE_HANDLE_ATTRIBUTE]: axis, 'data-index': index }}
      onPointerDown={(event) => onPress(axis, index, event)}
    >
      <Grip aria-hidden="true" />
    </button>
  );
}

export interface AddButtonsProps {
  rows: boolean;
  columns: boolean;
  onAddRow: () => void;
  onAddColumn: () => void;
}

/** Obsidian's add buttons: a bar under the table adds a row, one at its right a column. Seen while pointed at. */
export function TableAddButtons({ rows, columns, onAddRow, onAddColumn }: AddButtonsProps): React.JSX.Element {
  return (
    <>
      {rows && (
        <LabelTooltip label="Add row below">
          <button {...chromeButtonProps()} className="atlas-sb-sheet-table__add atlas-sb-sheet-table__add--row" aria-label="Add row below" onClick={onAddRow}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
      {columns && (
        <LabelTooltip label="Add column to the right">
          <button {...chromeButtonProps()} className="atlas-sb-sheet-table__add atlas-sb-sheet-table__add--column" aria-label="Add column to the right" onClick={onAddColumn}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
    </>
  );
}

/** Where a dragged row or column lands: a line between two, in the accent colour. */
export function TableDropLine({ line }: { line: DropLine }): React.JSX.Element {
  const style: React.CSSProperties = line.axis === 'row'
    ? { width: line.length, transform: `translate(${line.cross}px, ${line.offset}px)` }
    : { height: line.length, transform: `translate(${line.offset}px, ${line.cross}px)` };
  return <div className={`atlas-sb-sheet-table__drop atlas-sb-sheet-table__drop--${line.axis}`} style={style} aria-hidden="true" />;
}
