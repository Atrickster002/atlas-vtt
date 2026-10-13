import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import { followHistoryAcrossLevels } from '../../../src/app/react/components/levels/levelHistoryFollow';
import { levelsChanged } from '../../../src/app/levels/levelsChanged';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: '', elevation: { bottom: 20, top: 30 }, background: null },
];

const token = (id: string, level?: string, x = 0): TokenEntity => ({ id, kind: 'token', x, y: 0, imagePath: 't.png', ...(level && { level }) });

function sceneStore(): { store: ViewAtlasStore; stop: () => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-history-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'ground',
    objects: { ...store.getState().objects, tokens: { knight: token('knight'), mage: token('mage', 'upper') } },
  });
  getHistoryStore(store)?.getState().clear();
  return { store, stop: followHistoryAcrossLevels(store) };
}

const undo = (store: ViewAtlasStore): void => getHistoryStore(store)?.getState().undo();
const redo = (store: ViewAtlasStore): void => getHistoryStore(store)?.getState().redo();

afterEach(() => { vi.mocked(Notice).mockClear(); });

describe('the levels a write changed', () => {
  it('are those its objects stood and stand on, and those whose alignment changed, bottom first', () => {
    const before = { objects: { tokens: { a: token('a'), b: token('b', 'roof') }, walls: {} } };
    expect(levelsChanged(before, { objects: { ...before.objects, tokens: { ...before.objects.tokens, b: token('b', 'roof', 5) } } }, LEVELS)).toEqual(['roof']);
    expect(levelsChanged(before, { objects: { ...before.objects, tokens: { ...before.objects.tokens, a: token('a', 'upper') } } }, LEVELS)).toEqual(['ground', 'upper']);
    expect(levelsChanged(before, { objects: { ...before.objects, walls: { w: { levels: 'all' } } } }, LEVELS)).toEqual(['ground', 'upper', 'roof']);
    expect(levelsChanged(before, { objects: before.objects, levelAlignments: { upper: { offset: { x: 0, y: 0 }, scale: 2, stretch: { x: 1, y: 1 } } } }, LEVELS)).toEqual(['upper']);
    expect(levelsChanged(before, before, LEVELS)).toEqual([]);
  });
});

describe('undo and redo on a scene with levels', () => {
  it('show the level a step changed when it changed nothing on the level shown, and say so', () => {
    const { store, stop } = sceneStore();
    store.getState().setViewedLevel('upper');
    store.getState().moveToken('mage', 70, 70);
    store.getState().setViewedLevel('ground');

    undo(store);

    expect(store.getState().objects.tokens.mage).toMatchObject({ x: 0 });
    expect(store.getState().viewedLevel).toBe('upper');
    expect(vi.mocked(Notice)).toHaveBeenCalledWith(expect.stringContaining('Upper'));

    store.getState().setViewedLevel('roof');
    redo(store);
    expect(store.getState().viewedLevel).toBe('upper');
    stop();
  });

  it('stay on the level shown when a step changed it, and let go of what the step took to another level', () => {
    const { store, stop } = sceneStore();
    store.getState().moveTokensToLevel(['knight'], 'upper');
    undo(store);
    store.getState().setSelection(['knight']);

    redo(store);

    expect(store.getState().viewedLevel).toBe('ground');
    expect(store.getState().selectedIds).toEqual([]);
    expect(vi.mocked(Notice)).not.toHaveBeenCalled();
    stop();
  });

  it('leave the view alone for a write that is no undo', () => {
    const { store, stop } = sceneStore();
    store.getState().moveToken('mage', 70, 70);
    expect(store.getState().viewedLevel).toBe('ground');
    stop();
  });
});
