import { describe, expect, it } from 'vitest';
import { hiddenOnNewScenes, legacySwitches, toggleHidden } from '../../../src/app/resources/sceneVisibility';

describe('scene visibility of resources', () => {
  it('switches one resource without touching the others', () => {
    expect(toggleHidden(['stress'], 'hp')).toEqual(['stress', 'hp']);
    expect(toggleHidden(['stress', 'hp'], 'stress')).toEqual(['hp']);
    expect(toggleHidden(undefined, 'hp')).toEqual(['hp']);
  });

  it('tells an older Atlas the two switches it knows', () => {
    expect(legacySwitches([])).toEqual({ showHPBars: true, showStressBars: true });
    expect(legacySwitches(['stress', 'ammo'])).toEqual({ showHPBars: true, showStressBars: false });
    expect(legacySwitches(undefined)).toEqual({ showHPBars: true, showStressBars: true });
  });

  it('starts a new scene with the bars the collection\'s old default widgets switched off', () => {
    expect(hiddenOnNewScenes({ hpBar: false, stressBar: false })).toEqual(['hp', 'stress']);
    expect(hiddenOnNewScenes({ hpBar: true, stressBar: true })).toEqual([]);
    // Collections created since carry no such switches: they show every resource they define
    expect(hiddenOnNewScenes({ initiativeTracker: true })).toEqual([]);
    expect(hiddenOnNewScenes(undefined)).toEqual([]);
  });
});
