import React, { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import {
  addTable, deleteTable, renameTable, rowsFromPaste, setTableRows, tableNameOf, tableNameProblem, tableRows, type LookupRow,
} from '../../../model/lookupOps';
import { useTemplateEditor } from '../editorContext';

/** One cell of a table: written to the table when it is left, as one step. */
function Cell({ value, label, onCommit }: { value: string; label: string; onCommit: (text: string) => void }): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="atlas-te-input atlas-te-table__cell"
      aria-label={label}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/** A table: its name (which patterns use: `{cr|lookup:xp}`), its rows, a row to add, and pasting from a spreadsheet. */
function TableEditor({ name }: { name: string }): React.JSX.Element {
  const { session, snapshot, announce } = useTemplateEditor();
  const rows = tableRows(snapshot.template, name);
  const nameId = useId();
  const [naming, setNaming] = useState<string | null>(null);
  const problem = naming !== null && naming !== name ? tableNameProblem(snapshot.template, tableNameOf(naming), name) : null;
  const write = (next: readonly LookupRow[]): void => session.apply((current) => setTableRows(current, name, next));
  const setCell = (index: number, column: 0 | 1, text: string): void => {
    write(rows.map((row, at): LookupRow => (at !== index ? row : column === 0 ? [text, row[1]] : [row[0], text])));
  };
  return (
    <section className="atlas-te-table" aria-labelledby={nameId}>
      <div className="atlas-te-table__head">
        <input
          id={nameId}
          className="atlas-te-input atlas-te-table__name"
          aria-label="Table name"
          value={naming ?? name}
          onFocus={() => setNaming(name)}
          onChange={(event) => setNaming(event.target.value)}
          onBlur={() => {
            const next = naming === null ? name : tableNameOf(naming);
            if (next && next !== name && !tableNameProblem(snapshot.template, next, name)) session.apply((current) => renameTable(current, name, next));
            setNaming(null);
          }}
        />
        <ToolButton icon={Trash2} label={`Delete the ${name} table`} isActive={false}
          onClick={() => {
            session.apply((current) => deleteTable(current, name));
            announce(`Deleted the ${name} table.`);
          }} />
      </div>
      {problem && <p className="atlas-te-table__problem">{problem}</p>}
      <p className="atlas-te-table__use">Write <code>{`{property|lookup:${name}}`}</code> to look a value up.</p>
      <div
        className="atlas-te-table__grid"
        role="table"
        aria-label={`${name} rows`}
        onPaste={(event) => {
          const pasted = rowsFromPaste(event.clipboardData.getData('text/plain'));
          if (pasted.length < 2) return;
          event.preventDefault();
          write([...rows, ...pasted]);
          announce(`Pasted ${pasted.length} rows into ${name}.`);
        }}
      >
        <div role="row" className="atlas-te-table__row atlas-te-table__row--head">
          <span role="columnheader">When it reads</span>
          <span role="columnheader">Write</span>
        </div>
        {rows.map(([from, to], index) => (
          <div key={`${index}-${from}`} role="row" className="atlas-te-table__row">
            <Cell value={from} label={`Row ${index + 1}, when it reads`} onCommit={(text) => setCell(index, 0, text)} />
            <Cell value={to} label={`Row ${index + 1}, write`} onCommit={(text) => setCell(index, 1, text)} />
          </div>
        ))}
        <NewRow onAdd={(row) => write([...rows, row])} />
      </div>
    </section>
  );
}

/** The last row: typed into, it becomes a row of the table. */
function NewRow({ onAdd }: { onAdd: (row: LookupRow) => void }): React.JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const add = (): void => {
    if (!from.trim()) return;
    onAdd([from, to]);
    setFrom('');
    setTo('');
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };
  return (
    <div role="row" className="atlas-te-table__row atlas-te-table__row--new">
      <input className="atlas-te-input atlas-te-table__cell" aria-label="New row, when it reads" placeholder="1/4" value={from}
        onChange={(event) => setFrom(event.target.value)} onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) add(); }} />
      <input className="atlas-te-input atlas-te-table__cell" aria-label="New row, write" placeholder="50" value={to}
        onChange={(event) => setTo(event.target.value)} onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) add(); }} />
    </div>
  );
}

/**
 * The Tables tab (spec §10.6): the template's lookup tables, each turning one
 * value into another (a rating into XP, a rank into dice), made, renamed,
 * filled row by row or pasted from a spreadsheet, and deleted.
 */
export function TablesTab(): React.JSX.Element {
  const { session, snapshot, announce } = useTemplateEditor();
  const names = Object.keys(snapshot.template.lookups ?? {});
  return (
    <div className="atlas-te-tables">
      {names.length === 0 && <p className="atlas-te-fields__empty">Tables turn one value into another, like a rating into XP.</p>}
      {names.map((name) => <TableEditor key={name} name={name} />)}
      <Button type="button" variant="ghost" size="sm" className="atlas-te-fields__new" disabled={snapshot.readOnly}
        onClick={() => {
          let made = '';
          session.apply((current) => {
            const added = addTable(current);
            made = added.name;
            return added.template;
          });
          if (made) announce(`Added the ${made} table.`);
        }}>
        <Plus aria-hidden="true" />
        New table
      </Button>
    </div>
  );
}
