import { describe, expect, it } from 'vitest';
import { startingResources, statblockResourceValue } from '../../../src/app/resources/statblockResourceValues';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', defeatedWhenSpent: false };

describe('statblock resource values', () => {
  it('starts each defined resource from its field', () => {
    const cairnTroll = { hp: 14, stats: [14, 12, 4] };
    expect(startingResources(cairnTroll, [HP_RESOURCE, STR])).toEqual({ hp: { current: 14, max: 14 }, str: { current: 14, max: 14 } });
  });

  it('starts filling resources empty', () => {
    expect(statblockResourceValue({ stress: 6 }, STRESS_RESOURCE)).toEqual({ current: 0, max: 6 });
  });

  it('gives nothing for a missing or non-numeric field', () => {
    expect(statblockResourceValue({ hp: 8 }, STR)).toBeNull();
    expect(statblockResourceValue({ hp: '2d8' }, HP_RESOURCE)).toBeNull();
    expect(startingResources({}, [HP_RESOURCE, STR])).toEqual({});
  });
});
