import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeQueries } from '../mocks/fakeLootQueries';
import { BREW_NOTE } from '../fixtures/tableNotes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { RandomTables } from '../../src/app/react/components/randomTables/RandomTablesPanel';
import { AssetService } from '../../src/app/services/AssetService';
import { LootHistoryStore } from '../../src/app/loot/LootHistoryStore';
import type { RandomTableSource } from '../../src/app/types/randomTableTypes';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));
vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));

const GEAR_NOTE = '| Item | Price |\n| --- | --- |\n| Rope | 1 |\n';

interface Mounted {
  app: App;
  store: ViewAtlasStore;
  collectionId: string;
}

async function mount(randomTables: RandomTableSource[], lootBases: string[] = []): Promise<Mounted> {
  const { app } = createInMemoryApp({
    files: { 'Adventures/Brew.md': BREW_NOTE, 'Gear.md': GEAR_NOTE, 'Loot/Items.base': 'views:\n  - type: table\n    name: Weapons\n' },
  });
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const collectionId = assets.getDefaultCollectionId();
  await assets.updateCollectionSettings(collectionId, { randomTables, lootBases, lootCurrency: 'gp' });
  const store = createViewAtlasStore(app, 'map');
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapPath: `atlas-vtt/collections/${collectionId}/scenes/Cellar.atlasmap` });
  store.getState().setLootRollerOpen(true);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><RandomTables /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store, collectionId };
}

const RUMOURS: RandomTableSource = { path: 'Adventures/Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text', hiddenColumns: ['True?'] };
const GEAR: RandomTableSource = { path: 'Gear.md', index: 0, kind: 'items' };

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true;
  fakeQueries.reset();
  Reflect.set(AssetService, 'instance', null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  MotionGlobalConfig.skipAnimations = false;
});

describe('the Random tables window', () => {
  it('lists the tables of notes by kind and rolls the one picked, its hidden column marked', async () => {
    const { app, store, collectionId } = await mount([RUMOURS, GEAR]);
    const sidebar = await screen.findByRole('complementary');
    const items = within(sidebar).getByRole('region', { name: 'Items' });
    const text = within(sidebar).getByRole('region', { name: 'Text' });
    expect(within(items).getByRole('button', { name: /Gear/ })).toBeTruthy();
    const rumours = within(text).getByRole('button', { name: /Rumours in the Taproom/ });
    expect(rumours.textContent).toContain('d6');

    fireEvent.click(rumours);
    expect(store.getState().lootRoller.selected).toBe('Adventures/Brew.md#1');
    expect(document.querySelector('.atlas-tables-chip')?.textContent).toBe('Rolls d6');

    vi.spyOn(Math, 'random').mockReturnValue(0.4); // a 3 on the d6
    fireEvent.click(screen.getByRole('button', { name: 'Roll 🗣️ Rumours in the Taproom' }));

    const card = await screen.findByText('"The old wizard kept a pet that ate fire."');
    const result = card.closest('li')!;
    expect(within(result).getByText('3')).toBeTruthy();
    expect(within(result).getByText('True?')).toBeTruthy();
    expect(result.querySelector('.atlas-table-card__field.is-hidden')).toBeTruthy();
    expect(within(result).getByText('Brew › 🗣️ Rumours in the Taproom')).toBeTruthy();

    await waitFor(async () => expect(await LootHistoryStore.forApp(app).load(collectionId)).toHaveLength(1));
    const [saved] = await LootHistoryStore.forApp(app).load(collectionId);
    expect(saved?.draws).toEqual([]);
    expect(saved?.results?.[0]?.roll).toEqual({ die: 'd6', total: 3 });
  });

  it('shows rolls of every kind in the history, counted', async () => {
    const { store } = await mount([RUMOURS, GEAR]);
    fireEvent.click(within(await screen.findByRole('complementary')).getByRole('button', { name: /Gear/ }));
    expect(screen.queryByText('No repeats')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Roll Gear' }));
    await screen.findByText('Rope');

    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Rumours in the Taproom/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll 🗣️ Rumours in the Taproom' }));
    await waitFor(() => expect(store.getState().lootRoller.lastRoll?.results).toHaveLength(1));

    act(() => store.getState().updateLootRoller({ pane: 'history' }));
    await waitFor(() => expect(document.querySelectorAll('.atlas-loot-history__roll')).toHaveLength(2));
    const counts = [...document.querySelectorAll('.atlas-loot-history__count')].map((count) => count.textContent);
    expect(counts).toEqual(['1 result', '1 item']);
  });

  it('saves No repeats on the table, keeping the rest of its entry', async () => {
    const { app, collectionId } = await mount([{ ...RUMOURS, ...{ future: 1 } } as RandomTableSource]);
    await waitFor(() => expect(document.querySelector('.atlas-tables-chip')?.textContent).toBe('Rolls d6'));
    fireEvent.click(screen.getByRole('switch', { name: 'No repeats' }));
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toEqual([
      { ...RUMOURS, future: 1, noRepeats: true },
    ]));
  });

  it('searches the tables by name', async () => {
    await mount([RUMOURS, GEAR, { path: 'Adventures/Brew.md', index: 0, kind: 'text' }]);
    const search = await screen.findByRole('searchbox', { name: 'Search tables' });
    fireEvent.change(search, { target: { value: 'tunnel' } });
    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).queryByRole('button', { name: /Rumours/ })).toBeNull();
    expect(within(sidebar).getByRole('button', { name: /Tunnel Encounters/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(within(sidebar).getByText('No table matches')).toBeTruthy();
  });

  it('offers a table from a note while the collection has none', async () => {
    await mount([]);
    expect(await screen.findByText('No random tables yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use a table from a note' })).toBeTruthy();
  });

  it('marks a table whose note is gone and does not roll it', async () => {
    await mount([{ path: 'Gone.md', index: 0, kind: 'text' }]);
    const roll = await screen.findByRole('button', { name: 'Roll Gone' });
    expect((roll as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.atlas-tables-chip--problem')?.textContent).toBe('The note is gone');
  });
});
