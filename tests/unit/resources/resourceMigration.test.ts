import { describe, expect, it } from 'vitest';
import { migrateTokenSettings, migrateTokenState } from '../../../src/app/resources/resourceMigration';

describe('migrateTokenState', () => {
  it('moves object HP and numeric stress into resources', () => {
    const token = { id: 't1', kind: 'character', hp: { current: 5, max: 12 }, stress: 2, maxStress: 6 };
    expect(migrateTokenState(token)).toEqual({ id: 't1', kind: 'character', resources: { hp: { current: 5, max: 12 }, stress: { current: 2, max: 6 } } });
  });

  it('keeps the old display maxima for bare numbers', () => {
    expect(migrateTokenState({ hp: 12, stress: 3 }).resources).toEqual({ hp: { current: 12, max: 100 }, stress: { current: 3, max: 10 } });
  });

  it('carries hope, dashboard resources and override flags', () => {
    const migrated = migrateTokenState({
      hope: { current: 2, max: 6 },
      statblockResources: { mana: { current: 4, max: 10 }, 'resources.ammo': { current: 1, max: 6 } },
      maxHpOverridden: true, maxStressOverridden: false, hp: { current: 9, max: 9 },
    });
    expect(migrated.resources).toEqual({ hp: { current: 9, max: 9 }, hope: { current: 2, max: 6 }, mana: { current: 4, max: 10 }, ammo: { current: 1, max: 6 } });
    expect(migrated.overriddenMax).toEqual(['hp']);
    expect(migrated).not.toHaveProperty('statblockResources');
    expect(migrated).not.toHaveProperty('maxHpOverridden');
  });

  it('is idempotent and leaves new-format tokens alone', () => {
    const token = { resources: { hp: { current: 1, max: 4 } }, overriddenMax: ['hp'] };
    expect(migrateTokenState(token)).toBe(token);
    expect(migrateTokenState(migrateTokenState({ hp: 3 }))).toEqual({ resources: { hp: { current: 3, max: 100 } } });
  });

  it('never lets an old field overwrite a value already in resources', () => {
    expect(migrateTokenState({ hp: 3, resources: { hp: { current: 7, max: 9 } } }).resources).toEqual({ hp: { current: 7, max: 9 } });
  });
});

describe('migrateTokenSettings', () => {
  it('turns the two bar switches into one', () => {
    expect(migrateTokenSettings({ showHPBars: false, showStressBars: false, showNameplates: true })).toEqual({ showResources: false, showNameplates: true });
    expect(migrateTokenSettings({ showHPBars: true, showStressBars: false })).toEqual({ showResources: true });
    expect(migrateTokenSettings({ showResources: false })).toEqual({ showResources: false });
    expect(migrateTokenSettings({ showNameplates: true })).toEqual({ showNameplates: true });
  });
});
