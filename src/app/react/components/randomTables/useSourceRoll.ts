import { useMemo } from 'react';
import type { LootRoll } from '../../../loot/lootHistory';
import type { RarityTone } from '../../../loot/lootRarity';
import { countByRarity, countDrawable, rollLoot } from '../../../loot/lootRoller';
import { rollCollectionTable, tableRollEntry } from '../../../randomTables/tableResults';
import type { SelectedSource } from './tableSelection';
import type { RandomTablesLibrary } from './useRandomTables';
import { rollFactLong, statusLine, tableName } from './tableFacts';
import { t } from '../../../i18n';

export interface SourceRoll {
  /** What one roll gives, for the count's unit. */
  unit: 'items' | 'results';
  rollLabel: string;
  /** The button's name where its text alone does not say what it rolls. */
  rollName?: string;
  /** What a roll does, or why it cannot be made. */
  hint: string;
  canRoll: boolean;
  /** Items of each rarity a base's ticked views hold; empty for a table. */
  rarityCounts: ReadonlyMap<RarityTone, number>;
  /** Makes the roll; null when it gave nothing. */
  roll: (count: number, mapName: string) => Promise<LootRoll | null>;
}

interface RollChoices {
  disabledViews: ReadonlySet<string>;
  excludedRarities: ReadonlySet<RarityTone>;
}

const NO_RARITIES: ReadonlyMap<RarityTone, number> = new Map();

/** How the selected source is rolled: a base's ticked views by rarity, or a note's table by its die or weights. */
export function useSourceRoll(
  source: SelectedSource | null,
  library: Pick<RandomTablesLibrary, 'currency' | 'resolver'>,
  { disabledViews, excludedRarities }: RollChoices,
  count: number,
): SourceRoll {
  const baseItems = useMemo(() => (source?.kind === 'base'
    ? source.base.views.filter((view) => !disabledViews.has(view.id)).flatMap((view) => view.items)
    : []), [source, disabledViews]);
  const rarityCounts = useMemo(() => (baseItems.length > 0 ? countByRarity(baseItems) : NO_RARITIES), [baseItems]);
  const available = useMemo(() => countDrawable(baseItems, excludedRarities), [baseItems, excludedRarities]);
  const { currency, resolver } = library;

  if (source?.kind === 'table') {
    const found = source.table;
    const status = statusLine(found);
    const table = found.table;
    const canRoll = table !== null && table.rows.length > 0;
    return {
      unit: found.source.kind === 'items' ? 'items' : 'results',
      rollLabel: t('tables.roll'),
      rollName: t('tables.rollTable', { name: tableName(found) }),
      hint: !canRoll ? status ?? t('tables.nothingToRoll') : rollFactLong(table),
      canRoll,
      rarityCounts: NO_RARITIES,
      roll: async (rolls, mapName) => {
        const outcome = await rollCollectionTable(found, { count: rolls, resolver, currency });
        return outcome.results.length + outcome.draws.length > 0 ? tableRollEntry(outcome, mapName) : null;
      },
    };
  }

  return {
    unit: 'items',
    rollLabel: t('loot.roll'),
    hint: available === 0 ? t('loot.nothingToRoll') : t('loot.draws', { items: t('loot.items', { count }), count: available }),
    canRoll: available > 0,
    rarityCounts,
    roll: (rolls, mapName) => {
      const draws = rollLoot(baseItems, { count: rolls, excluded: excludedRarities, currency });
      return Promise.resolve(draws.length > 0 ? { id: crypto.randomUUID(), rolledAt: Date.now(), mapName, draws } : null);
    },
  };
}
