import React, { useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { lootBaseItemCount, needsBases, type LootBase } from '../../../loot/LootBaseReader';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { LootViewChecks } from '../loot/LootSourceTree';
import { matchesSearch } from './tableSelection';
import { problemLines, rollFact, statusLine, tableName } from './tableFacts';
import type { RandomTablesLibrary } from './useRandomTables';
import { t } from '../../../i18n';

interface SourceRowProps {
  name: string;
  /** The die or the number of entries, at the row's end. */
  fact: string;
  /** What is wrong with the source, one line each; the row carries a warning when any. */
  problems: readonly string[];
  selected: boolean;
  onSelect: () => void;
}

function SourceRow({ name, fact, problems, selected, onSelect }: SourceRowProps): React.ReactElement {
  const row = (
    <button
      type="button"
      className={`atlas-tables-row${selected ? ' is-selected' : ''}`}
      aria-current={selected || undefined}
      onClick={onSelect}
    >
      <span className="atlas-tables-row__name">{name}</span>
      {problems.length > 0 && <AlertTriangle className="atlas-tables-row__problem" aria-hidden />}
      <span className="atlas-tables-row__fact">{fact}</span>
    </button>
  );
  return problems.length > 0 ? <LabelTooltip describe multiline label={problems.join(' · ')}>{row}</LabelTooltip> : row;
}

function baseProblems(base: LootBase): string[] {
  if (base.missing) return [t('csm.loot.notFound')];
  if (needsBases(base)) return [t('csm.loot.basesOff')];
  if (base.views.length === 0) return [t('csm.loot.noViews')];
  return [];
}

function tableProblems(found: CollectionTable): string[] {
  const status = statusLine(found);
  return [...(status ? [status] : []), ...(found.table ? problemLines(found.table.problems) : [])];
}

interface TablesSidebarProps {
  library: Pick<RandomTablesLibrary, 'items' | 'text'>;
  /** Id of the source rolled on. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Base views switched off. */
  disabledViews: ReadonlySet<string>;
  onDisabledViewsChange: (disabled: string[]) => void;
}

/**
 * The collection's tables to pick one to roll on, grouped by what they give: Items (the loot
 * bases, the selected one with its views to tick, then the Items tables of notes) and Text.
 */
export function TablesSidebar({ library, selectedId, onSelect, disabledViews, onDisabledViewsChange }: TablesSidebarProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const bases = library.items.bases.filter((base) => matchesSearch(base.name, search)
    || base.views.some((view) => matchesSearch(view.name, search)));
  const itemTables = library.items.tables.filter((table) => matchesSearch(tableName(table), search));
  const textTables = library.text.filter((table) => matchesSearch(tableName(table), search));

  const tableRow = (table: CollectionTable): React.ReactElement => (
    <li key={table.id}>
      <SourceRow
        name={tableName(table)}
        fact={table.table ? rollFact(table.table) : ''}
        problems={tableProblems(table)}
        selected={table.id === selectedId}
        onSelect={() => onSelect(table.id)}
      />
    </li>
  );

  return (
    <div className="atlas-tables-sidebar">
      <label className="atlas-tables-search">
        <Search />
        <input
          type="search"
          value={search}
          placeholder={t('tables.search')}
          aria-label={t('tables.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {(bases.length > 0 || itemTables.length > 0) && (
        <section className="atlas-tables-group" aria-label={t('tables.group.items')}>
          <h3 className="atlas-loot-section-label">{t('tables.group.items')}</h3>
          <ul>
            {bases.map((base) => (
              <li key={base.path}>
                <SourceRow
                  name={base.name}
                  fact={String(lootBaseItemCount(base))}
                  problems={baseProblems(base)}
                  selected={base.path === selectedId}
                  onSelect={() => onSelect(base.path)}
                />
                {base.path === selectedId && (
                  <LootViewChecks base={base} disabled={disabledViews} onChange={onDisabledViewsChange} />
                )}
              </li>
            ))}
            {itemTables.map(tableRow)}
          </ul>
        </section>
      )}

      {textTables.length > 0 && (
        <section className="atlas-tables-group" aria-label={t('tables.group.text')}>
          <h3 className="atlas-loot-section-label">{t('tables.group.text')}</h3>
          <ul>{textTables.map(tableRow)}</ul>
        </section>
      )}

      {bases.length + itemTables.length + textTables.length === 0 && (
        <p className="atlas-tables-sidebar__none">{t('tables.noMatch')}</p>
      )}
    </div>
  );
}
