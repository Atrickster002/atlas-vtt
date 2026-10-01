import { describe, expect, it } from 'vitest';
import { hiddenOnNewScenes, toggleHidden } from '../../../src/app/resources/sceneVisibility';
import { sceneAdoption } from '../../../src/app/services/assetTransfer/sceneAdoption';

describe('scene visibility of resources', () => {
  it('switches one resource without touching the others', () => {
    expect(toggleHidden(['stress'], 'hp')).toEqual(['stress', 'hp']);
    expect(toggleHidden(['stress', 'hp'], 'stress')).toEqual(['hp']);
    expect(toggleHidden(undefined, 'hp')).toEqual(['hp']);
  });

  it('starts a new scene with the bars the collection\'s old default widgets switched off', () => {
    expect(hiddenOnNewScenes({ hpBar: false, stressBar: false })).toEqual(['hp', 'stress']);
    expect(hiddenOnNewScenes({ hpBar: true, stressBar: true })).toEqual([]);
    // Collections created since carry no such switches: they show every resource they define
    expect(hiddenOnNewScenes({ initiativeTracker: true })).toEqual([]);
    expect(hiddenOnNewScenes(undefined)).toEqual([]);
  });
});

describe('a scene that joins a collection', () => {
  const scene = (tokenSettings: Record<string, unknown> | undefined): string => JSON.stringify({ version: 4, state: { ...(tokenSettings && { tokenSettings }), objects: { tokens: {} } } });
  const settingsOf = (content: string | null): unknown => JSON.parse(content!).state.tokenSettings;

  it('shows the bars a new scene of that collection shows', () => {
    const fromPlain = scene({ showNameplates: true, showHPBars: true, showStressBars: false, hiddenResources: ['stress', 'ammo'] });
    // Into a collection that shows both bars
    expect(settingsOf(sceneAdoption('Daggerheart', { conditions: [], defaultWidgets: { hpBar: true, stressBar: true } }).map(fromPlain)))
      .toEqual({ showNameplates: true, showHPBars: true, showStressBars: true, hiddenResources: [] });
    // Into one whose scenes start without the HP bar
    expect(settingsOf(sceneAdoption('Quiet', { conditions: [], defaultWidgets: { hpBar: false } }).map(fromPlain)))
      .toEqual({ showNameplates: true, showHPBars: false, showStressBars: true, hiddenResources: ['hp'] });
  });

  it('is left as it is when it already shows them, and its snapshots keep their own switches', () => {
    const adopted = sceneAdoption('Own', { conditions: [] });
    expect(adopted.map(scene({ showHPBars: true, showStressBars: true, hiddenResources: [] }))).toBeNull();
    expect(adopted.snapshot(scene({ showHPBars: false, showStressBars: false }))).toBeNull();
  });
});
