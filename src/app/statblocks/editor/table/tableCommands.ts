/**
 * The edits a Table's menus, handles and add buttons make, as Obsidian's table
 * editor names them, each with what the live region says of it. Pure.
 */

import {
  alignColumns, canAddColumn, canAddRow, deleteColumn, deleteRow, duplicateColumn, duplicateRow, insertColumn, insertRow, moveColumn,
  moveRow, sortRows,
} from '../../model/tableEdits';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, type TableGrid } from '../../model/tableGrid';
import type { TableAlign } from '../../model/templateTypes';

export type TableCommand =
  | { kind: 'insert-row'; at: number }
  | { kind: 'duplicate-row'; row: number }
  | { kind: 'delete-row'; row: number }
  | { kind: 'move-row'; from: number; to: number }
  | { kind: 'insert-column'; at: number; align: TableAlign | null }
  | { kind: 'duplicate-column'; col: number }
  | { kind: 'delete-column'; col: number }
  | { kind: 'move-column'; from: number; to: number }
  | { kind: 'align'; col: number; align: TableAlign }
  | { kind: 'sort'; col: number; direction: 1 | -1 };

export interface CommandOutcome {
  grid: TableGrid;
  /** What the live region says of a change. */
  said: string;
  /** Why the table took no change it was asked for (it holds as many rows or columns as it takes). */
  refused?: string | undefined;
}

const ALIGN_WORDS: Readonly<Record<TableAlign, string>> = { start: 'left', center: 'center', end: 'right' };

/** "column Str" or "column 3" where it has no name. */
function columnWords(grid: TableGrid, col: number): string {
  const name = grid.columns[col]?.name.trim();
  return name ? `column ${name}` : `column ${col + 1}`;
}

/** The table after `command`, and what to say; the very grid where the command changes nothing. */
export function runTableCommand(grid: TableGrid, command: TableCommand): CommandOutcome {
  switch (command.kind) {
    case 'insert-row': {
      if (!canAddRow(grid)) return { grid, said: '', refused: `A table holds at most ${MAX_TABLE_ROWS} rows.` };
      return { grid: insertRow(grid, command.at), said: `Added row ${command.at + 1}.` };
    }
    case 'duplicate-row': return { grid: duplicateRow(grid, command.row), said: `Duplicated row ${command.row + 1}.` };
    case 'delete-row': return { grid: deleteRow(grid, command.row), said: `Deleted row ${command.row + 1}.` };
    case 'move-row': return { grid: moveRow(grid, command.from, command.to), said: `Moved row ${command.from + 1} to row ${command.to + 1}.` };
    case 'insert-column': {
      if (!canAddColumn(grid)) return { grid, said: '', refused: `A table holds at most ${MAX_TABLE_COLUMNS} columns.` };
      return { grid: insertColumn(grid, command.at, command.align), said: `Added column ${command.at + 1}.` };
    }
    case 'duplicate-column': return { grid: duplicateColumn(grid, command.col), said: `Duplicated ${columnWords(grid, command.col)}.` };
    case 'delete-column': return { grid: deleteColumn(grid, command.col), said: `Deleted ${columnWords(grid, command.col)}.` };
    case 'move-column': return { grid: moveColumn(grid, command.from, command.to), said: `Moved ${columnWords(grid, command.from)}.` };
    case 'align': return { grid: alignColumns(grid, [command.col], command.align), said: `Aligned ${columnWords(grid, command.col)} ${ALIGN_WORDS[command.align]}.` };
    case 'sort': {
      const sorted = sortRows(grid, command.col, command.direction);
      return { grid: sorted, said: `Sorted by ${columnWords(grid, command.col)}, ${command.direction > 0 ? 'A to Z' : 'Z to A'}.` };
    }
  }
}
