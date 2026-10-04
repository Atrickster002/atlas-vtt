import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { AssetService, type CollectionMetadata } from '../../../../src/app/services/AssetService';
import {
  collectionsUsingTemplate, dependantsIn, keyDependants, readsKey, renamedPath, settingsWithRenamedKey, updateKeyDependants,
} from '../../../../src/app/statblocks/library/keyDependants';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../../../../src/app/types/creatureFilterTypes';
import { noteHarness } from '../notes/noteHarness';

const MARSH = 'marsh-creature-k7m2qa';

const resource = (key: string, field: string): ResourceDefinition => ({
  key, name: key.toUpperCase(), field, direction: 'drains', color: '#cc3333', visibleToPlayers: true,
});
const HP = resource('hp', 'hp');
const HP_MAX = resource('wounds', 'hp.max');
const STRESS = resource('stress', 'stress');
const HP_LEVEL: CreatureFilterDefinition = { id: 'hp-level', label: 'Toughness', kind: 'range', field: 'hp' };
const TRAITS: CreatureFilterDefinition = { id: 'traits', label: 'Traits', kind: 'options', fields: ['trait_01', 'hp', 'hpx'], match: 'all' };

function collection(id: string, settings: Partial<CollectionSettings>): CollectionMetadata {
  return { id, uid: id, version: 1, name: `${id} campaign`, tags: {}, settings: { conditions: [], ...settings }, createdAt: 0, modifiedAt: 0 };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('what reads a key', () => {
  it('reads a key and the parts of its value, never a key that only starts the same', () => {
    expect(readsKey('hp', 'hp')).toBe(true);
    expect(readsKey('hp.max', 'hp')).toBe(true);
    expect(readsKey('hpx', 'hp')).toBe(false);
    expect(renamedPath('hp.max', 'hp', 'hit_points')).toBe('hit_points.max');
    expect(renamedPath('hpx', 'hp', 'hit_points')).toBe('hpx');
  });

  it('lists a collection\'s resources and custom filters that read it', () => {
    const marsh = collection('marsh', { resources: [HP, STRESS, HP_MAX], customCreatureFilters: [HP_LEVEL, TRAITS] });

    expect(dependantsIn(marsh, 'hp')).toEqual([
      { collectionId: 'marsh', collectionName: 'marsh campaign', kind: 'resource', name: 'HP', field: 'hp' },
      { collectionId: 'marsh', collectionName: 'marsh campaign', kind: 'resource', name: 'WOUNDS', field: 'hp.max' },
      { collectionId: 'marsh', collectionName: 'marsh campaign', kind: 'filter', name: 'Toughness', field: 'hp' },
      { collectionId: 'marsh', collectionName: 'marsh campaign', kind: 'filter', name: 'Traits', field: 'hp' },
    ]);
  });

  it('renames the key in those settings and leaves every other entry as it was', () => {
    const changes = settingsWithRenamedKey({ conditions: [], resources: [HP, STRESS, HP_MAX], customCreatureFilters: [HP_LEVEL, TRAITS] }, 'hp', 'hit_points');

    expect(changes?.resources).toEqual([{ ...HP, field: 'hit_points' }, STRESS, { ...HP_MAX, field: 'hit_points.max' }]);
    expect(changes?.resources?.[0]?.key).toBe('hp');
    expect(changes?.customCreatureFilters).toEqual([{ ...HP_LEVEL, field: 'hit_points' }, { ...TRAITS, fields: ['trait_01', 'hit_points', 'hpx'] }]);
    expect(changes?.customCreatureFilters?.[1]).toMatchObject({ match: 'all' });
    expect(settingsWithRenamedKey({ conditions: [], resources: [STRESS] }, 'hp', 'hit_points')).toBeNull();
  });
});

describe('the collections a template is used in', () => {
  it('are those whose roles start from it and those whose tokens link one of its notes', async () => {
    const harness = noteHarness({ 'Bestiary/Warden.md': `---\natlas-template: ${MARSH}\nhp: 14\n---\n` });
    const collections = [
      collection('roles', { statblockRoles: [{ id: 'creature', name: 'Creature', templateId: MARSH }], resources: [HP] }),
      collection('linked', { resources: [HP], customCreatureFilters: [HP_LEVEL] }),
      collection('elsewhere', { resources: [HP] }),
    ];
    const tokens = [{ collection: 'linked', statblockPath: 'Bestiary/Warden.md' }, { collection: 'elsewhere', statblockPath: 'Bestiary/Goblin.md' }];
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollections: async () => collections,
      getAssets: async () => tokens,
      loadedCollections: () => collections,
    } as unknown as AssetService);

    const using = await collectionsUsingTemplate(harness.app, MARSH, ['Bestiary/Warden.md']);
    const dependants = await keyDependants(harness.app, MARSH, 'hp', ['Bestiary/Warden.md']);

    expect(using.map(({ id }) => id)).toEqual(['roles', 'linked']);
    expect(dependants.map(({ collectionId, kind }) => `${collectionId} ${kind}`)).toEqual(['roles resource', 'linked resource', 'linked filter']);
  });

  it('updates each collection that has dependants with one settings save', async () => {
    const harness = noteHarness({});
    const settings: Record<string, CollectionSettings> = {
      marsh: { conditions: [], resources: [HP, STRESS], customCreatureFilters: [HP_LEVEL] },
      plain: { conditions: [], resources: [STRESS] },
    };
    const updateCollectionSettings = vi.fn(async () => undefined);
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollectionSettings: (id: string) => settings[id],
      updateCollectionSettings,
    } as unknown as AssetService);

    await updateKeyDependants(harness.app, ['marsh', 'marsh', 'plain'], 'hp', 'hit_points');

    expect(updateCollectionSettings.mock.calls).toEqual([[
      'marsh',
      { resources: [{ ...HP, field: 'hit_points' }, STRESS], customCreatureFilters: [{ ...HP_LEVEL, field: 'hit_points' }] },
    ]]);
  });
});
