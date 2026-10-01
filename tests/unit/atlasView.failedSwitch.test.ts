import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

const CAVE = new TFile('maps/cave.atlasmap');
const TOWER = new TFile('maps/tower.atlasmap');

function setup(options: { sceneLoads: boolean; mapLoaded: boolean; isMapLoading?: boolean }) {
  const tabMetaStore = createTabMetaStore();
  const caveId = tabMetaStore.getState().addTab(CAVE.path, 'Cave');
  const towerId = tabMetaStore.getState().addTab(TOWER.path, 'Tower');
  tabMetaStore.getState().setActiveTab(caveId);
  const context = {
    tabMetaStore, isSwitching: false,
    store: { getState: () => ({ mapLoaded: options.mapLoaded, isMapLoading: options.isMapLoading ?? false }) },
    flushPendingSaves: vi.fn().mockResolvedValue(undefined),
    saveTemporalState: vi.fn(), saveViewportState: vi.fn(),
    restoreTemporalState: vi.fn(), restoreViewportState: vi.fn(),
    performSceneLoad: vi.fn().mockResolvedValue(options.sceneLoads),
    app: {
      vault: { getAbstractFileByPath: (path: string) => (path === CAVE.path ? CAVE : TOWER) },
      workspace: { requestSaveLayout: vi.fn() },
    },
  };
  const switchToTab = (id: string): Promise<void> => AtlasView.prototype.switchToTab.call(context as unknown as AtlasView, id);
  return { context, switchToTab, caveId, towerId };
}

describe('switching scene tabs around a load that did not finish', () => {
  it('restores the history and viewport of a tab whose scene loaded', async () => {
    const { context, switchToTab, caveId, towerId } = setup({ sceneLoads: true, mapLoaded: true });

    await switchToTab(towerId);

    expect(context.saveViewportState).toHaveBeenCalledWith(caveId);
    expect(context.restoreTemporalState).toHaveBeenCalledWith(towerId);
    expect(context.restoreViewportState).toHaveBeenCalledWith(towerId);
  });

  it('does not apply a tab\'s history and viewport when its scene failed to load or was replaced', async () => {
    const { context, switchToTab, towerId } = setup({ sceneLoads: false, mapLoaded: true });

    await switchToTab(towerId);

    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER);
    expect(context.restoreTemporalState).not.toHaveBeenCalled();
    expect(context.restoreViewportState).not.toHaveBeenCalled();
    expect(context.isSwitching).toBe(false);
  });

  it('keeps the cached history and viewport of a tab whose scene is not loaded', async () => {
    const { context, switchToTab, towerId } = setup({ sceneLoads: true, mapLoaded: false });

    await switchToTab(towerId);

    expect(context.saveTemporalState).not.toHaveBeenCalled();
    expect(context.saveViewportState).not.toHaveBeenCalled();
    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER);
  });

  it('loads the active tab again when its scene failed to load', async () => {
    const { context, switchToTab, caveId } = setup({ sceneLoads: true, mapLoaded: false });

    await switchToTab(caveId);

    expect(context.performSceneLoad).toHaveBeenCalledWith(CAVE);
  });

  it.each([
    ['loaded', { mapLoaded: true }],
    ['still loading', { mapLoaded: false, isMapLoading: true }],
  ])('leaves the active tab alone while its scene is %s', async (_label, sceneState) => {
    const { context, switchToTab, caveId } = setup({ sceneLoads: true, ...sceneState });

    await switchToTab(caveId);

    expect(context.performSceneLoad).not.toHaveBeenCalled();
  });
});
