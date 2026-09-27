import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TFile } from 'obsidian';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import type { CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';

// The real sidebar, filter engine and creature index over an in-memory vault of statblock notes.
const FRONTMATTER: Record<string, Record<string, unknown>> = {
  'Bestiary/Goblin.md': { statblock: true, name: 'Goblin', cr: '1/4', type: 'humanoid' },
  'Bestiary/Wolf.md': { statblock: true, name: 'Wolf', cr: '1/4', type: 'beast' },
  'Bestiary/Bear.md': { statblock: true, name: 'Bear', cr: 1, type: 'Beast' },
  'Bestiary/Dragon.md': { statblock: true, name: 'Dragon', cr: 10, type: 'dragon' },
};
const FILTERS: CreatureFilterDefinition[] = [
  { id: 'cr', label: 'CR', kind: 'range', field: 'cr' },
  { id: 'type', label: 'Type', kind: 'options', fields: ['type'] },
];
const token = (name: string, statblockPath?: string, size?: number): TokenAsset => ({
  id: name, name, type: 'tokens', imageUrl: '', folderId: null, modifiedAt: 0,
  ...(statblockPath && { statblockPath }), ...(size && { size }),
});
const TOKENS = [
  token('Goblin', 'Bestiary/Goblin.md'),
  token('Wolf', 'Bestiary/Wolf.md'),
  token('Bear', 'Bestiary/Bear.md', 1.5),
  token('Dragon', 'Bestiary/Dragon.md', 2),
  token('Innkeeper'),
];

const events = { on: () => ({}), offref: () => {} };
const app = {
  workspace: events,
  metadataCache: { ...events, getFileCache: (file: TFile) => ({ frontmatter: FRONTMATTER[file.path] }) },
  vault: { ...events, getAbstractFileByPath: (path: string) => (FRONTMATTER[path] ? new TFile(path) : null), cachedRead: async () => '' },
};
const assetService = { getCollectionSettings: () => ({ conditions: [], creatureFilters: FILTERS }) };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    app, assetService, folders: [], availableTags: [], assets: TOKENS,
    collections: [{ id: 'default', uid: 'u-default', name: 'Default' }],
  }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({ Header: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ assets, onClearFilters }: { assets: AnyAsset[]; onClearFilters?: () => void }) => (
    <>
      <ul aria-label="Assets">{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>
      {assets.length === 0 && onClearFilters && <button onClick={onClearFilters}>Clear filters</button>}
    </>
  ),
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  CreatureIndex.release(app as never);
  vi.unstubAllGlobals();
});

const shown = (): Array<string | null> => within(screen.getByRole('list', { name: 'Assets' })).queryAllByRole('listitem').map((item) => item.textContent);
const option = (group: string, name: RegExp): HTMLElement => within(screen.getByRole('group', { name: group })).getByRole('button', { name });

async function openManager(): Promise<void> {
  render(<AssetManager isOpen onClose={() => {}} />);
  await screen.findByRole('group', { name: 'Type' });
}

it('lists the statblock fields of the collection with how many characters have each value', async () => {
  await openManager();
  expect(within(screen.getByRole('group', { name: 'Type' })).getAllByRole('button').map((button) => button.textContent))
    .toEqual(['beast2', 'dragon1', 'humanoid1']);
  expect(screen.getAllByRole('slider').map((thumb) => thumb.getAttribute('aria-label'))).toEqual(['Lowest CR', 'Highest CR']);
});

it('filters by options, keeping the counts of the other options', async () => {
  await openManager();
  fireEvent.click(option('Type', /^beast/));
  expect(shown()).toEqual(['Bear', 'Wolf']);
  expect(option('Type', /^beast/).getAttribute('aria-pressed')).toBe('true');
  expect(option('Type', /^dragon/).textContent).toBe('dragon1');
});

it('filters by a range and says which characters it hides for lack of the field', async () => {
  await openManager();
  const highest = screen.getByRole('slider', { name: 'Highest CR' });
  act(() => {
    fireEvent.focus(highest);
    fireEvent.keyDown(highest, { key: 'ArrowLeft' });
  });
  expect(shown()).toEqual(['Bear', 'Goblin', 'Wolf']);
  expect(screen.getByRole('status').textContent).toBe('Hidden: 1 without a statblock');
});

it('filters by statblock link and token size', async () => {
  await openManager();
  fireEvent.click(screen.getByRole('radio', { name: 'Not linked' }));
  expect(shown()).toEqual(['Innkeeper']);
  fireEvent.click(screen.getByRole('radio', { name: 'All' }));
  fireEvent.click(option('Size', /^Large/));
  expect(shown()).toEqual(['Bear']);
});

it('offers to clear filters that leave nothing', async () => {
  await openManager();
  fireEvent.click(option('Type', /^dragon/));
  fireEvent.click(screen.getByRole('radio', { name: 'Not linked' }));
  expect(shown()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(shown()).toHaveLength(5);
});
