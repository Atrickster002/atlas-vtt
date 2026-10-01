import { describe, expect, it } from 'vitest';
import { parseResourceDefinition, resourceKey, sameResourceDefinitions } from '../../../src/app/resources/resourceDefinitions';

describe('resource definitions', () => {
  it('derives a stable key from the name', () => {
    expect(resourceKey('Ammo', [])).toBe('ammo');
    expect(resourceKey('Hit Protection', [])).toBe('hit-protection');
    expect(resourceKey('Ammo', ['ammo'])).toBe('ammo-2');
    expect(resourceKey('Ammo', ['ammo', 'ammo-2'])).toBe('ammo-3');
    expect(resourceKey('!!!', [])).toBe('resource');
  });

  it('keeps valid definitions and drops broken ones', () => {
    const valid = { key: 'ammo', name: 'Ammo', field: 'ammo', direction: 'drains', look: 'badge', color: '#f59e0b', visibleToPlayers: false };
    expect(parseResourceDefinition(valid)).toEqual(valid);
    expect(parseResourceDefinition({ ...valid, defeatedWhenSpent: true })).toEqual({ ...valid, defeatedWhenSpent: true });
    expect(parseResourceDefinition({ ...valid, key: '' })).toBeNull();
    expect(parseResourceDefinition({ ...valid, field: ' ' })).toBeNull();
    expect(parseResourceDefinition({ ...valid, direction: 'sideways' })).toBeNull();
    expect(parseResourceDefinition({ ...valid, color: 'red' })).toBeNull();
    expect(parseResourceDefinition('ammo')).toBeNull();
  });

  it('compares definitions by content and order', () => {
    const a = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains' as const, look: 'bar' as const, color: '#22C55E', visibleToPlayers: true };
    expect(sameResourceDefinitions([a], [{ ...a, color: '#22c55e' }])).toBe(true);
    expect(sameResourceDefinitions([a], [{ ...a, field: 'health' }])).toBe(false);
    expect(sameResourceDefinitions(undefined, [])).toBe(true);
  });
});
