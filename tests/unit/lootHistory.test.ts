import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { LOOT_HISTORY_LIMIT, readLootHistory, type LootRoll } from '../../src/app/loot/lootHistory';
import { LootHistoryStore, lootHistoryPath } from '../../src/app/loot/LootHistoryStore';

function roll(id: string, mapName = 'Crypt'): LootRoll {
  return { id, rolledAt: 1, mapName, draws: [{ id: `${id}-1`, notePath: 'Loot.md', source: ['Loot'], name: 'Rope', properties: [] }] };
}

describe('readLootHistory', () => {
  it('keeps valid rolls and drops broken rolls and items', () => {
    const broken = { ...roll('b'), draws: [{ id: 'x' }] };
    const partly = { ...roll('c'), draws: [...roll('c').draws, { name: 'no id' }] };
    expect(readLootHistory({ format: 1, rolls: [roll('a'), broken, partly, 'junk'] })).toEqual([roll('a'), roll('c')]);
    expect(readLootHistory('junk')).toEqual([]);
  });

  it('keeps at most the history limit', () => {
    const rolls = Array.from({ length: LOOT_HISTORY_LIMIT + 5 }, (_, i) => roll(`r${i}`));
    expect(readLootHistory({ rolls })).toHaveLength(LOOT_HISTORY_LIMIT);
  });
});

describe('LootHistoryStore', () => {
  it('shares the rolls of a collection between its maps and saves them once after a pause', async () => {
    vi.useFakeTimers();
    try {
      const { app, files } = createInMemoryApp({ files: { [lootHistoryPath('dh')]: JSON.stringify({ format: 1, rolls: [roll('old')] }) } });
      const store = LootHistoryStore.forApp(app);
      const seen: string[][] = [];
      store.subscribe('dh', (rolls) => seen.push(rolls.map((entry) => entry.id)));

      expect((await store.load('dh')).map((entry) => entry.id)).toEqual(['old']);
      store.add('dh', roll('new', 'Forest'));
      store.add('dh', roll('newer', 'Tower'));
      await vi.waitFor(() => expect(seen.at(-1)).toEqual(['newer', 'new', 'old']));
      expect(app.vault.adapter.write).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(app.vault.adapter.write).toHaveBeenCalledTimes(1);
      const saved = readLootHistory(JSON.parse(files.get(lootHistoryPath('dh')) ?? '{}'));
      expect(saved.map((entry) => entry.mapName)).toEqual(['Tower', 'Forest', 'Crypt']);

      store.remove('dh', 'new');
      store.clear('other');
      await vi.advanceTimersByTimeAsync(1000);
      expect((await store.load('dh')).map((entry) => entry.id)).toEqual(['newer', 'old']);
      expect(await store.load('other')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
