import type { App } from 'obsidian';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import { COLLECTION_DATA_DIR } from '../services/collectionBundle/installRecord';
import { parentPath } from '../utils/pathUtils';
import { debounce, type DebouncedFunction } from '../../utils/debounce';
import { LOOT_HISTORY_LIMIT, readLootHistory, type LootRoll } from './lootHistory';

/** Several rolls in a row are written together. */
const SAVE_DELAY_MS = 800;
const HISTORY_FORMAT = 1;

type Listener = (rolls: readonly LootRoll[]) => void;

/** The history file of a collection, beside its other Atlas data. */
export function lootHistoryPath(collectionId: string): string {
  return `${COLLECTION_DATA_DIR}/collections/${collectionId}/loot-history.json`;
}

/**
 * The loot rolled in each collection, shared by all its maps. Rolls are kept in
 * memory once read, every open map is told about changes, and the file is
 * written shortly after the last change.
 */
export class LootHistoryStore {
  private static readonly instances = new WeakMap<App, LootHistoryStore>();

  /** Writes pending changes now, when the plugin unloads. */
  static flush(app: App): void {
    for (const save of this.instances.get(app)?.saves.values() ?? []) save.flush();
  }

  static forApp(app: App): LootHistoryStore {
    let store = this.instances.get(app);
    if (!store) {
      store = new LootHistoryStore(app);
      this.instances.set(app, store);
    }
    return store;
  }

  private readonly rolls = new Map<string, readonly LootRoll[]>();
  private readonly reads = new Map<string, Promise<readonly LootRoll[]>>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly saves = new Map<string, DebouncedFunction<[]>>();

  private constructor(private readonly app: App) {}

  /** The collection's rolls, read from its file the first time. */
  load(collectionId: string): Promise<readonly LootRoll[]> {
    const known = this.rolls.get(collectionId);
    if (known) return Promise.resolve(known);
    let read = this.reads.get(collectionId);
    if (!read) {
      read = this.read(collectionId);
      this.reads.set(collectionId, read);
    }
    return read;
  }

  /** Calls `listener` with the collection's rolls whenever they change. */
  subscribe(collectionId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(collectionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(collectionId, listeners);
    return () => listeners.delete(listener);
  }

  add(collectionId: string, roll: LootRoll): void {
    void this.edit(collectionId, (rolls) => [roll, ...rolls].slice(0, LOOT_HISTORY_LIMIT));
  }

  remove(collectionId: string, rollId: string): void {
    void this.edit(collectionId, (rolls) => rolls.filter((roll) => roll.id !== rollId));
  }

  clear(collectionId: string): void {
    void this.edit(collectionId, () => []);
  }

  private async read(collectionId: string): Promise<readonly LootRoll[]> {
    const path = lootHistoryPath(collectionId);
    let rolls: readonly LootRoll[] = [];
    try {
      if (await this.app.vault.adapter.exists(path)) {
        rolls = readLootHistory(JSON.parse(await this.app.vault.adapter.read(path)));
      }
    } catch (error) {
      console.error(`[Atlas] Could not read the loot history of collection ${collectionId}:`, error);
    }
    // An edit made while reading wins over the file.
    if (!this.rolls.has(collectionId)) this.rolls.set(collectionId, rolls);
    this.reads.delete(collectionId);
    return this.rolls.get(collectionId) ?? rolls;
  }

  private async edit(collectionId: string, change: (rolls: readonly LootRoll[]) => readonly LootRoll[]): Promise<void> {
    await this.load(collectionId);
    // The cache, not the value read: another edit may have landed meanwhile.
    const next = change(this.rolls.get(collectionId) ?? []);
    this.rolls.set(collectionId, next);
    for (const listener of this.listeners.get(collectionId) ?? []) listener(next);

    let save = this.saves.get(collectionId);
    if (!save) {
      save = debounce(() => this.write(collectionId), SAVE_DELAY_MS);
      this.saves.set(collectionId, save);
    }
    save();
  }

  private async write(collectionId: string): Promise<void> {
    const path = lootHistoryPath(collectionId);
    try {
      await ensureAdapterFolder(this.app, parentPath(path));
      const rolls = this.rolls.get(collectionId) ?? [];
      await this.app.vault.adapter.write(path, JSON.stringify({ format: HISTORY_FORMAT, rolls }));
    } catch (error) {
      console.error(`[Atlas] Could not save the loot history of collection ${collectionId}:`, error);
    }
  }
}
