import { useEffect, useMemo, useState } from 'react';
import type { App, TAbstractFile } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { isLootBaseLoaded, LootBaseReader, needsBases, type LootBase } from '../../../loot/LootBaseReader';

export interface LootLibrary {
  /** The bases in the order given, each as soon as it has been read. */
  bases: LootBase[];
  /** False until every view of every base has been read once, or cannot be. */
  loaded: boolean;
  /** False when Obsidian cannot run the bases: the Bases core plugin is off. */
  basesAvailable: boolean;
}

/** What a collection's settings say about loot. */
export interface CollectionLoot {
  bases: readonly string[];
  currency: string | undefined;
}

const NO_LOOT: CollectionLoot = { bases: [], currency: undefined };

function lootOf(app: App, collectionId: string | null): CollectionLoot {
  if (!collectionId) return NO_LOOT;
  const { lootBases = [], lootCurrency } = AssetService.getInstance(app).getCollectionSettings(collectionId);
  return { bases: lootBases, currency: lootCurrency };
}

function sameLoot(a: CollectionLoot, b: CollectionLoot): boolean {
  return a.currency === b.currency && a.bases.length === b.bases.length && a.bases.every((path, index) => path === b.bases[index]);
}

/** The loot bases and currency of a collection, following edits to its settings. */
export function useCollectionLoot(app: App, collectionId: string | null): CollectionLoot {
  const [loot, setLoot] = useState(() => lootOf(app, collectionId));

  useEffect(() => {
    const update = (): void => {
      const next = lootOf(app, collectionId);
      setLoot((current) => (sameLoot(current, next) ? current : next));
    };
    update();
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changedId) => {
      if (changedId === collectionId) update();
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);

  return loot;
}

/**
 * The views and items of the given bases. Obsidian keeps each view's items
 * current; a base is read again, on its own, when its file is edited,
 * created, moved or deleted.
 */
export function useLootBases(app: App, paths: readonly string[]): LootLibrary {
  const [byPath, setByPath] = useState<ReadonlyMap<string, LootBase>>(new Map());
  // Keyed on the paths, not the array: a caller's new array with the same bases must not read them again.
  const pathKey = paths.join('\n');

  useEffect(() => {
    const readers = new Map(pathKey.split('\n').filter(Boolean).map((path) => [
      path,
      new LootBaseReader(app, path, (base) => setByPath((current) => new Map(current).set(path, base))),
    ]));
    const load = (path: string): void => {
      readers.get(path)?.load().catch((error: unknown) => {
        console.error(`[Atlas] Failed to read the loot base ${path}:`, error);
      });
    };
    const onChange = (file: TAbstractFile, oldPath?: string): void => {
      load(file.path);
      if (oldPath !== undefined) load(oldPath);
    };

    setByPath((current) => new Map([...current].filter(([path]) => readers.has(path))));
    for (const path of readers.keys()) load(path);
    const refs = [
      app.vault.on('modify', (file) => onChange(file)),
      app.vault.on('create', (file) => onChange(file)),
      app.vault.on('delete', (file) => onChange(file)),
      app.vault.on('rename', (file, oldPath) => onChange(file, oldPath)),
    ];
    return () => {
      for (const reader of readers.values()) reader.stop();
      for (const ref of refs) app.vault.offref(ref);
    };
  }, [app, pathKey]);

  return useMemo(() => {
    const bases = paths.flatMap((path) => {
      const base = byPath.get(path);
      return base ? [base] : [];
    });
    return {
      bases,
      loaded: bases.length === paths.length && bases.every(isLootBaseLoaded),
      basesAvailable: !bases.some(needsBases),
    };
  }, [paths, byPath]);
}
