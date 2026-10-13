import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { HEADER_ROW } from '../../model/tableGrid';
import { TABLE_COL_ATTRIBUTE, TABLE_ROW_ATTRIBUTE } from '../../render/blocks/TableView';
import type { TableCommand } from './tableCommands';
import { TableDrag, type DropLine, type TableAxis } from './TableDrag';
import type { TableRoom } from './tableHost';

export interface TableDragState {
  /** Where the dragged row or column would land; null while nothing is dragged over another place. */
  drop: DropLine | null;
  dragging: boolean;
  /** A press on a row's or column's handle: the drag begins once the pointer moves. */
  start: (axis: TableAxis, index: number, handle: HTMLElement, event: PointerEvent) => void;
}

/**
 * Dragging a Table's rows and columns by their handles (`TableDrag`): the
 * rows are measured by their `tr`, the columns by their first row's cells,
 * and a drop moves the row or column as the menu's Move does.
 */
export function useTableDrag(frameRef: React.RefObject<HTMLDivElement | null>, room: TableRoom, header: boolean, run: (command: TableCommand) => void): TableDragState {
  const [drop, setDrop] = useState<DropLine | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<TableDrag | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => () => drag.current?.cancel(), []);

  const start = (axis: TableAxis, index: number, handle: HTMLElement, event: PointerEvent): void => {
    const frame = frameRef.current;
    if (!frame || (axis === 'row' ? !room.rows : !room.columns)) return;
    drag.current?.cancel();
    drag.current = new TableDrag({
      axis,
      from: index,
      frame,
      boxes: () => (axis === 'row'
        ? [...frame.querySelectorAll(`tbody > tr > [${TABLE_COL_ATTRIBUTE}="0"]`)].map((cell) => (cell.parentElement ?? cell).getBoundingClientRect())
        : [...frame.querySelectorAll(`[${TABLE_ROW_ATTRIBUTE}="${header ? HEADER_ROW : 0}"]`)].map((cell) => cell.getBoundingClientRect())),
      onStart: () => setDragging(true),
      onLine: setDrop,
      onDrop: (to) => {
        setDragging(false);
        runRef.current(axis === 'row' ? { kind: 'move-row', from: index, to } : { kind: 'move-column', from: index, to });
      },
      onCancel: () => setDragging(false),
    }, handle, event);
  };

  return { drop, dragging, start };
}
