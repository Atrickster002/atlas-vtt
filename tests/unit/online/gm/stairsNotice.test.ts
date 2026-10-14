import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';
import { tellStairsTaken } from '../../../../src/app/online/gm/stairsNotice.ts';
import type { SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { showNotice } from '../../../../src/app/ui/notice';

vi.mock('../../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

afterEach(() => vi.mocked(showNotice).mockClear());

function scene(): { store: SceneStore; setViewedLevel: ReturnType<typeof vi.fn> } {
  const setViewedLevel = vi.fn();
  const state = {
    levels: [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
      { id: 'upper', name: '', elevation: { bottom: 10, top: 20 }, background: null },
    ],
    objects: { tokens: { ogre: { id: 'ogre', kind: 'character', x: 0, y: 0, imagePath: 'o.png', name: 'Ogre' }, bear: { id: 'bear', kind: 'character', x: 0, y: 0, imagePath: 'b.png', name: 'Bear' } } },
    setViewedLevel,
  };
  return { store: { getState: () => state, setState: vi.fn(), subscribe: vi.fn() } as unknown as SceneStore, setViewedLevel };
}

describe('telling the GM a player\'s token took stairs', () => {
  it('names the tokens and the level once, and offers to show that level to the players', () => {
    const { store, setViewedLevel } = scene();
    const executeCommandById = vi.fn(() => true);
    const setActiveLeaf = vi.fn();
    const app = { commands: { executeCommandById }, workspace: { setActiveLeaf } } as unknown as App;
    const leaf = {} as WorkspaceLeaf;

    tellStairsTaken(app, leaf, store, [{ tokenId: 'ogre', level: 'upper' }, { tokenId: 'bear', level: 'upper' }]);

    expect(showNotice).toHaveBeenCalledOnce();
    const message = vi.mocked(showNotice).mock.calls[0]![0] as DocumentFragment;
    expect(message.textContent).toBe('Ogre and Bear took the stairs to Level 2, a level the players are not shown. Show Level 2 to players');
    message.querySelector('a')!.click();
    expect(setViewedLevel).toHaveBeenCalledWith('upper');
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: false });
    expect(executeCommandById).toHaveBeenCalledWith('atlas-vtt:send-map-to-player-view');
  });
});
