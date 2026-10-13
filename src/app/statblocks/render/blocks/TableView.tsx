import React, { useContext } from 'react';
import type { CellAt } from '../../model/tableGrid';
import { HEADER_ROW } from '../../model/tableGrid';
import type { TableAlign } from '../../model/templateTypes';
import { SheetContext, useSheet } from '../sheetContext';
import { InlineText } from '../shared/InlineText';
import { ProblemMarker } from '../values/ProblemMarker';
import { hasText, type ShownText } from '../values/shownText';
import type { ShownTable } from '../values/shownTable';

/** A cell's row in the table (-1: the header row); with `TABLE_COL_ATTRIBUTE`, how an editor finds the cell clicked. */
export const TABLE_ROW_ATTRIBUTE = 'data-table-row';
/** A cell's column in the table. */
export const TABLE_COL_ATTRIBUTE = 'data-table-col';

/** What a column without a name is called while a statblock or template is edited. */
export function unnamedColumn(col: number): string {
  return `Column ${col + 1}`;
}

/** What an editor adds to the table: its inputs, handles and buttons. Every part is optional; the card has none. */
export interface TableDecor {
  /** What stands in a cell: `content` itself, or the editor's input over it. */
  cell?: ((at: CellAt, content: React.ReactNode) => React.ReactNode) | undefined;
  /** A cell's own class names (selection, the cell being typed). */
  cellClass?: ((at: CellAt) => string | undefined) | undefined;
  /** Drawn in each row's first cell, out of the flow: the row's handle. */
  rowHandle?: ((row: number) => React.ReactNode) | undefined;
  /** Drawn in each first-row cell, out of the flow: the column's handle. */
  columnHandle?: ((col: number) => React.ReactNode) | undefined;
  /** Drawn after the table in its frame: the add buttons, a drag's drop line. */
  after?: React.ReactNode;
  /** The frame around the table: its ref, keys and pointer handlers. */
  frame?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> } & Record<`data-${string}`, string | undefined>;
}

const ALIGNS: Readonly<Record<TableAlign, React.CSSProperties['textAlign']>> = { start: 'start', center: 'center', end: 'end' };

function alignStyle(align: TableAlign | null): React.CSSProperties | undefined {
  return align && align !== 'start' ? { textAlign: ALIGNS[align] } : undefined;
}

/** A cell's text, Markdown drawn as a note's table draws it, or a zero-width space that keeps an empty cell one line high, as Obsidian keeps one with a line break. */
export function CellText({ shown }: { shown: ShownText }): React.JSX.Element {
  const sheet = useContext(SheetContext);
  return (
    <>
      {hasText(shown) ? <InlineText text={shown.text} app={sheet?.app} sourcePath={sheet?.sourcePath} dice /> : '\u200b'}
      {shown.problems.length > 0 && <ProblemMarker problems={shown.problems} />}
    </>
  );
}

/** A column's name, or while editing what an unnamed one is called, faint. */
export function ColumnName({ name, col }: { name: string; col: number }): React.ReactNode {
  const { state } = useSheet();
  if (name.trim()) return name;
  return state.mode === 'editing' ? <span className="atlas-sb-sheet-table__unnamed">{unnamedColumn(col)}</span> : '\u200b';
}

function cellProps(at: CellAt, decor: TableDecor | undefined, align: TableAlign | null, base: string): React.TdHTMLAttributes<HTMLTableCellElement> {
  const extra = decor?.cellClass?.(at);
  return {
    className: extra ? `${base} ${extra}` : base,
    style: alignStyle(align),
    [TABLE_ROW_ATTRIBUTE]: at.row,
    [TABLE_COL_ATTRIBUTE]: at.col,
  } as React.TdHTMLAttributes<HTMLTableCellElement>;
}

/**
 * A Table as Obsidian draws a Markdown table (its `--table-*` theme
 * variables): the header row of column names over the rows, then the
 * worked-out rows, muted, after a corner column for their labels. The frame
 * around it has room for an editor's handles and add buttons on every side,
 * held out of the card's flow, so the editing card is laid out as the card is.
 */
export function TableView({ shown, decor }: { shown: ShownTable; decor?: TableDecor | undefined }): React.JSX.Element {
  const { grid, cells, derived } = shown;
  const labelled = derived.some((row) => row.label.trim());
  const corner = labelled ? <td className="atlas-sb-sheet-table__corner" aria-hidden="true" /> : null;
  const first = shown.header ? HEADER_ROW : 0;
  const content = (at: CellAt, node: React.ReactNode): React.ReactNode => (decor?.cell ? decor.cell(at, node) : node);
  const handles = (at: CellAt): React.ReactNode => (
    <>
      {at.col === 0 && at.row >= 0 && decor?.rowHandle?.(at.row)}
      {at.row === first && decor?.columnHandle?.(at.col)}
    </>
  );
  const { ref, className, ...frame } = decor?.frame ?? {};

  return (
    <div className="atlas-sb-sheet-table">
      <div className="atlas-sb-sheet-table__scroll">
        <div ref={ref} className={className ? `atlas-sb-sheet-table__frame ${className}` : 'atlas-sb-sheet-table__frame'} {...frame}>
          <table className="atlas-sb-sheet-table__grid">
            {shown.header && (
              <thead>
                <tr>
                  {corner}
                  {grid.columns.map((column, col) => {
                    const at = { row: HEADER_ROW, col };
                    return (
                      <th key={col} scope="col" {...cellProps(at, decor, column.align, 'atlas-sb-sheet-table__name')}>
                        {content(at, <ColumnName name={column.name} col={col} />)}
                        {handles(at)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              {cells.map((row, r) => (
                <tr key={r}>
                  {corner}
                  {row.map((cell, col) => {
                    const at = { row: r, col };
                    return (
                      <td key={col} {...cellProps(at, decor, grid.columns[col]?.align ?? null, 'atlas-sb-sheet-table__cell')}>
                        {content(at, <CellText shown={cell} />)}
                        {handles(at)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {derived.map((row, index) => (
                <tr key={`derived-${index}`} className="atlas-sb-sheet-table__derived">
                  {labelled && <th scope="row" className="atlas-sb-sheet-table__derived-label">{row.label}</th>}
                  {row.cells.map((cell, col) => (
                    <td key={col} className="atlas-sb-sheet-table__worked" style={alignStyle(grid.columns[col]?.align ?? null)}>
                      <CellText shown={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {decor?.after}
        </div>
      </div>
    </div>
  );
}
