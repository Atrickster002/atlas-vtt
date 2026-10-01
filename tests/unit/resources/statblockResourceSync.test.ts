import { describe, expect, it } from 'vitest';
import { syncedResources } from '../../../src/app/resources/statblockResourceSync';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', defeatedWhenSpent: false };

describe('statblock resource sync', () => {
  it('takes a new maximum, keeps and clamps the current value', () => {
    const token = { resources: { hp: { current: 10, max: 14 }, str: { current: 14, max: 14 } } };
    expect(syncedResources(token, { hp: 8, stats: [12, 12, 4] }, [HP_RESOURCE, STR])).toEqual({
      hp: { current: 8, max: 8 }, str: { current: 12, max: 12 },
    });
  });

  it('leaves hand-set maxima and values the statblock lacks alone', () => {
    const token = { resources: { hp: { current: 3, max: 20 }, ammo: { current: 2, max: 6 } }, overriddenMax: ['hp'] };
    expect(syncedResources(token, { hp: 8 }, [HP_RESOURCE])).toEqual({ hp: { current: 3, max: 20 }, ammo: { current: 2, max: 6 } });
  });
});
