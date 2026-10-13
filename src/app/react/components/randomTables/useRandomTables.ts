import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import type { LootBase } from '../../../loot/LootBaseReader';
import { TableNoteReader, type CollectionTable } from '../../../randomTables/TableNoteReader';
import type { TableResolver } from '../../../randomTables/resultCells';
import { readRandomTables } from '../../../randomTables/tableSettings';
import { AssetService } from '../../../services/AssetService';
import type { RandomTableSource, RarityOption } from '../../../types/randomTableTypes';
import { collectionItemRarities, sameItemRarities } from '../../../gameSystems/itemRarities';
import { useSystemPresets } from '../../hooks/useSystemPresets';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { useCollectionLoot, useLootBases } from '../loot/useLootBases';

/** The tables a collection rolls on, grouped by what their results are. */
export interface RandomTablesLibrary {
  /** Items: the loot bases with their views, then the Items tables of notes. */
  items: { bases: LootBase[]; tables: CollectionTable[] };
  text: CollectionTable[];
  /** Named after plain-number item prices. */
  currency: string | undefined;
  /** False until every base and note has been read once. */
  loaded: boolean;
  /** False when Obsidian cannot run the bases: the Bases core plugin is off. */
  basesAvailable: boolean;
  /** Finds the tables and Base views links in results name. */
  resolver: TableResolver;
  /** The words the collection's items name their rarity with, each with its tone. */
  rarities: readonly RarityOption[];
}

function sourcesOf(app: App, collectionId: string | null): RandomTableSource[] {
  return collectionId ? readRandomTables(AssetService.getInstance(app).getCollectionSettings(collectionId)) : [];
}

/** The table notes a collection's settings name, following edits to them. */
function useTableSources(app: App, collectionId: string | null): readonly RandomTableSource[] {
  const [sources, setSources] = useState(() => sourcesOf(app, collectionId));
  useEffect(() => {
    const update = (): void => {
      const next = sourcesOf(app, collectionId);
      setSources((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    update();
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changedId) => {
      if (changedId === collectionId) update();
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);
  return sources;
}

function raritiesOf(app: App, collectionId: string | null, presets: readonly SystemPreset[]): readonly RarityOption[] {
  return collectionItemRarities(collectionId ? AssetService.getInstance(app).getCollectionSettings(collectionId) : {}, presets);
}

/** The collection's rarity words, following edits to its settings and to the presets. */
function useCollectionRarities(app: App, collectionId: string | null): readonly RarityOption[] {
  const { presets } = useSystemPresets(app);
  const [rarities, setRarities] = useState(() => raritiesOf(app, collectionId, presets));
  useEffect(() => {
    const update = (): void => {
      const next = raritiesOf(app, collectionId, presets);
      setRarities((current) => (sameItemRarities(current, next) ? current : next));
    };
    update();
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changedId) => {
      if (changedId === collectionId) update();
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId, presets]);
  return rarities;
}

/**
 * Every table of a collection, live: the views of its loot bases (as the loot roller reads
 * them) and the tables of the notes it names, each with its die or count and its problems.
 */
export function useRandomTables(app: App, collectionId: string | null): RandomTablesLibrary {
  const loot = useCollectionLoot(app, collectionId);
  const library = useLootBases(app, loot.bases);
  const sources = useTableSources(app, collectionId);
  const rarities = useCollectionRarities(app, collectionId);
  const [tables, setTables] = useState<readonly CollectionTable[]>([]);
  const [reader, setReader] = useState<TableNoteReader | null>(null);

  useEffect(() => {
    const next = new TableNoteReader(app, setTables);
    setReader(next);
    return () => next.stop();
  }, [app]);

  useEffect(() => {
    reader?.setSources(sources);
  }, [reader, sources]);

  return useMemo(() => ({
    items: { bases: library.bases, tables: tables.filter((table) => table.source.kind === 'items') },
    text: tables.filter((table) => table.source.kind === 'text'),
    currency: loot.currency,
    loaded: library.loaded && reader !== null && tables.length === sources.length && tables.every((table) => table.status !== 'loading'),
    basesAvailable: library.basesAvailable,
    resolver: reader?.resolver ?? { resolve: () => Promise.resolve(null) },
    rarities,
  }), [library, tables, loot.currency, reader, sources.length, rarities]);
}
