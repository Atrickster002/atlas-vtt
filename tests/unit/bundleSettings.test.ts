import { describe, expect, it } from 'vitest';
import { fieldFingerprint } from '../../src/app/services/collectionBundle/fingerprints';
import { settingsFromBundle, withSettingsFiles } from '../../src/app/services/collectionBundle/bundleSettings';
import type { CollectionMetadata } from '../../src/app/services/AssetService';
import { HP, STR, STRESS } from '../mocks/resourceFixtures';

const collection = (settings: CollectionMetadata['settings']): CollectionMetadata => ({ id: 'Own', name: 'Own', settings } as CollectionMetadata);
const daggerheart = { conditions: [], systemPresetId: 'builtin:daggerheart', defaultWidgets: { hpBar: true, stressBar: true } };

describe('a collection\'s settings in a bundle', () => {
  it('count as unchanged when Atlas only stored the resources they already read as', async () => {
    const before = await fieldFingerprint(collection(daggerheart), 'settings');
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP, STRESS] }), 'settings')).toBe(before);
    // What players see is the table's choice, as the old player switch was
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [{ ...HP, visibleToPlayers: true }, STRESS] }), 'settings')).toBe(before);
  });

  it('count as changed when the GM changed the resources', async () => {
    const before = await fieldFingerprint(collection(daggerheart), 'settings');
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP, STRESS, STR] }), 'settings')).not.toBe(before);
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP] }), 'settings')).not.toBe(before);
  });

  it('keep the vault\'s resources when the bundle, written by an older Atlas, names none', () => {
    const mine = { ...daggerheart, resources: [{ ...HP, visibleToPlayers: true }, STRESS] };
    expect(settingsFromBundle({ ...daggerheart, lootCurrency: 'gp' }, mine)).toEqual({ ...daggerheart, lootCurrency: 'gp', resources: mine.resources });
    expect(settingsFromBundle({ ...daggerheart, resources: [HP] }, mine).resources).toEqual([HP]);
    expect(settingsFromBundle(daggerheart, undefined)).toEqual(daggerheart);
  });

  it('name their loot bases and their world map where those files are, and none that has no place', () => {
    const settings = { ...daggerheart, lootBases: ['Loot/Items.base', 'Loot/Gone.base'], worldMap: 'Maps/World.webp' };
    const places = new Map([['Loot/Items.base', 'pack/Items.base'], ['Maps/World.webp', 'pack/World.webp']]);
    expect(withSettingsFiles(settings, (path) => places.get(path))).toEqual({ ...daggerheart, lootBases: ['pack/Items.base'], worldMap: 'pack/World.webp' });

    const withoutMap = withSettingsFiles(settings, (path) => (path.endsWith('.base') ? path : undefined));
    expect(withoutMap).toEqual({ ...daggerheart, lootBases: settings.lootBases });
    expect(withoutMap).not.toHaveProperty('worldMap');
    // Settings that name no files stay as they are, without an empty list or an unset map.
    expect(withSettingsFiles(daggerheart, () => undefined)).toEqual(daggerheart);
    expect(Object.keys(withSettingsFiles(daggerheart, () => undefined))).toEqual(Object.keys(daggerheart));
  });
});
