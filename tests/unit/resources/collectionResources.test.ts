import { describe, expect, it } from 'vitest';
import { collectionResources, legacyCollectionResources } from '../../../src/app/resources/collectionResources';
import { parseResourceDefinitions } from '../../../src/app/resources/resourceDefinitions';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';

describe('legacyCollectionResources', () => {
  it('takes the recorded preset first', () => {
    const keys = legacyCollectionResources({ systemPresetId: 'builtin:cairn' }, BUILT_IN_SYSTEM_PRESETS).map((d) => d.key);
    expect(keys).toEqual(['hp', 'str']);
  });

  it('drops broken definitions when a collection index is loaded', () => {
    expect(parseResourceDefinitions([{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', look: 'bar', color: '#22c55e', visibleToPlayers: true }, { key: 'hp', name: 'Dup' }, null]).map((d) => d.key)).toEqual(['hp']);
  });

  it('falls back to the bars the old default widgets switched on', () => {
    expect(legacyCollectionResources({ defaultWidgets: { hpBar: true, stressBar: true } }, []).map((d) => d.key)).toEqual(['hp', 'stress']);
    expect(legacyCollectionResources({ defaultWidgets: { stressBar: true } }, []).map((d) => d.key)).toEqual(['stress']);
    expect(legacyCollectionResources({}, []).map((d) => d.key)).toEqual(['hp']);
  });

  it('reads a collection that never stored resources the same way', () => {
    expect(collectionResources({ conditions: [], systemPresetId: 'builtin:daggerheart' }).map((d) => d.key)).toEqual(['hp', 'stress']);
    expect(collectionResources({ conditions: [] }).map((d) => d.key)).toEqual(['hp']);
    expect(collectionResources({ conditions: [], resources: [] })).toEqual([]);
  });
});
