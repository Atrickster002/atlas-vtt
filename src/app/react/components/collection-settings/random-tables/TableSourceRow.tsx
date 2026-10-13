import React, { useId, useState } from 'react';
import { AlertTriangle, ChevronRight, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { SegmentedControl } from '../../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { CollectionTable } from '../../../../randomTables/TableNoteReader';
import type { RandomTableKind, RandomTableSource } from '../../../../types/randomTableTypes';
import { problemLines, rollFact, statusLine, tableName } from '../../randomTables/tableFacts';
import { t } from '../../../../i18n';

const KINDS = [
  { value: 'text', label: t('tables.kind.text') },
  { value: 'items', label: t('tables.kind.items') },
] as const;

interface TableSourceRowProps {
  found: CollectionTable;
  onChange: (source: RandomTableSource) => void;
  onRemove: () => void;
}

/** `hidden` with `column` switched: shown to players or only to the GM. */
function toggled(hidden: readonly string[], column: string): string[] {
  return hidden.includes(column) ? hidden.filter((entry) => entry !== column) : [...hidden, column];
}

/**
 * A table the collection rolls on: its name, how it rolls and what is wrong with it; opened, how
 * it is used. Never what it holds: the note is the table.
 */
export function TableSourceRow({ found, onChange, onRemove }: TableSourceRowProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const switchId = useId();
  const { source, table } = found;
  const status = statusLine(found);
  const problems = [...(status ? [status] : []), ...(table ? problemLines(table.problems) : [])];
  const hidden = source.hiddenColumns ?? [];
  // The first column is the result itself; the others may be the GM's alone.
  const columns = table?.columns.slice(1).filter(Boolean) ?? [];
  const name = tableName(found);

  const set = (change: Partial<RandomTableSource>): void => {
    const next: RandomTableSource = { ...source, ...change };
    if (next.hiddenColumns?.length === 0) delete next.hiddenColumns;
    if (next.noRepeats !== true) delete next.noRepeats;
    onChange(next);
  };

  return (
    <div className={`atlas-rt-row${open ? ' is-open' : ''}`}>
      <div className="atlas-rt-row__head">
        <button type="button" className="atlas-rt-row__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight />
          <span className="atlas-rt-row__name">{name}</span>
          {problems.length > 0 && (
            <span className="atlas-tables-chip atlas-tables-chip--problem"><AlertTriangle />{problems.join(' · ')}</span>
          )}
          {table && <span className="atlas-tables-row__fact">{rollFact(table)}</span>}
        </button>
        <SegmentedControl<RandomTableKind>
          value={source.kind}
          options={KINDS}
          ariaLabel={t('tables.settings.kindOf', { name })}
          onChange={(kind) => set({ kind })}
        />
        <LabelTooltip label={t('tables.settings.remove')}>
          <Button variant="ghost" size="icon" className="atlas-rt-row__remove" onClick={onRemove}>
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>
      {open && (
        <div className="atlas-rt-row__options">
          {columns.length > 0 && (
            <div className="atlas-rt-row__option">
              <span className="atlas-rt-row__label">{t('tables.settings.hiddenColumns')}</span>
              <div className="atlas-rt-columns" role="group" aria-label={t('tables.settings.hiddenColumns')}>
                {columns.map((column) => {
                  const isHidden = hidden.includes(column);
                  return (
                    <button
                      key={column}
                      type="button"
                      className={`atlas-rt-column${isHidden ? ' is-hidden' : ''}`}
                      aria-pressed={isHidden}
                      onClick={() => set({ hiddenColumns: toggled(hidden, column) })}
                    >
                      {isHidden && <EyeOff />}
                      {column}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="atlas-rt-row__option">
            <span id={switchId} className="atlas-rt-row__label">{t('tables.noRepeats')}</span>
            <label className="atlas-csm-switch">
              <input
                type="checkbox"
                aria-labelledby={switchId}
                checked={source.noRepeats === true}
                onChange={(event) => set({ noRepeats: event.target.checked })}
              />
              <span className="atlas-csm-switch-track" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
