import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { Header, type HeaderProps } from '../../src/app/packages/components/asset-manager/components/Header';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import { startSceneCreation } from '../../src/app/packages/components/asset-manager/utils/sceneCreation';
import type { AnyAsset, MapAsset } from '../../src/app/packages/components/asset-manager/types';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
// The search pulls in the filter panel and Obsidian scopes, which this test does not drive.
vi.mock('../../src/app/packages/components/asset-manager/components/HeaderSearch', () => ({ HeaderSearch: () => null }));

const keep: MapAsset = { id: 'keep', name: 'Keep', type: 'maps', imageUrl: '', mapFilePath: 'atlas-vtt/assets/keep.jpg', folderId: null, modifiedAt: 0 };
const goblin: AnyAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: '', folderId: null, modifiedAt: 0 };

function actions(): { openCreateScene: ReturnType<typeof vi.fn>; addMap: ReturnType<typeof vi.fn>; showMaps: ReturnType<typeof vi.fn> } {
  return { openCreateScene: vi.fn(), addMap: vi.fn(), showMaps: vi.fn() };
}

afterEach(() => {
  cleanup();
  vi.mocked(Notice).mockClear();
});

// #156: after adding a map, nothing in the Create menu or the map's menu led to a scene.
describe('creating a scene in the asset manager', () => {
  it('offers Create Scene in the Create menu', () => {
    const onCreateScene = vi.fn();
    const props = {
      app: {}, search: '', onSearch: vi.fn(), query: {}, activeTab: 'maps', onTabChange: vi.fn(),
      assetCounts: { scenes: 0, maps: 1, encounters: 0, tokens: 0 },
      onCreateScene, onCreateFolder: vi.fn(), onRefresh: vi.fn(), sidebarToggleLabel: 'Hide sidebar', onToggleSidebar: vi.fn(),
      sel: {
        navigationHistory: { canGoBack: () => false, canGoForward: () => false },
        selectedAssetIds: [], selectedFolderIds: [], sortOptions: ['name'], sortBy: 'name', sortOrder: 'asc',
      },
    } as unknown as HeaderProps;
    render(<Header {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByText('Create Scene'));
    expect(onCreateScene).toHaveBeenCalledTimes(1);
  });

  it('offers Create Scene on a map, built on that map', () => {
    const openCreateScene = vi.fn();
    const deps = { folders: [], transferTargets: [], selectedAssetIds: ['keep'], assets: [keep], openCreateScene } as unknown as AssetContextMenuDeps;
    const entry = buildAssetContextMenuEntries(keep, [keep], deps)[0];

    expect(entry).toMatchObject({ type: 'item', label: 'Create Scene' });
    if (entry.type === 'item') void entry.onClick();
    expect(openCreateScene).toHaveBeenCalledWith({ backgroundPath: 'atlas-vtt/assets/keep.jpg', defaultName: 'Keep' });
  });

  it('opens the scene dialog with the one selected map', () => {
    const act = actions();
    startSceneCreation([keep], 1, act);
    expect(act.openCreateScene).toHaveBeenCalledWith({ backgroundPath: 'atlas-vtt/assets/keep.jpg', defaultName: 'Keep' });
    expect(act.showMaps).not.toHaveBeenCalled();
  });

  it('shows the maps to pick one when no single map is selected', () => {
    const act = actions();
    startSceneCreation([goblin], 2, act);
    expect(act.showMaps).toHaveBeenCalled();
    expect(act.openCreateScene).not.toHaveBeenCalled();
    expect(act.addMap).not.toHaveBeenCalled();
    expect(vi.mocked(Notice).mock.calls[0][0]).toContain('Double-click the map for your scene');
  });

  it('asks for a map first when the collection has none', () => {
    const act = actions();
    startSceneCreation([], 0, act);
    expect(act.showMaps).toHaveBeenCalled();
    expect(act.addMap).toHaveBeenCalled();
    expect(act.openCreateScene).not.toHaveBeenCalled();
  });
});
