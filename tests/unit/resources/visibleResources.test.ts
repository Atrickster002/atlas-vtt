import { describe, expect, it } from 'vitest';
import { visibleResources } from '../../../src/app/resources/visibleResources';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';

const def = (key: string, visibleToPlayers: boolean): ResourceDefinition => ({ key, name: key.toUpperCase(), field: key, direction: 'drains', look: 'bar', color: '#ffffff', visibleToPlayers });

describe('visibleResources', () => {
  const definitions = [def('hp', true), def('str', false), def('ammo', true)];
  const token = { resources: { str: { current: 12, max: 14 }, hp: { current: 3, max: 8 }, mana: { current: 1, max: 1 } } };

  it('lists defined resources with a value in definition order', () => {
    expect(visibleResources(token, definitions, 'dm').map((r) => r.definition.key)).toEqual(['hp', 'str']);
  });

  it('shows players only what they may see', () => {
    expect(visibleResources(token, definitions, 'player').map((r) => r.definition.key)).toEqual(['hp']);
  });

  it('hides values without a usable maximum', () => {
    expect(visibleResources({ resources: { hp: { current: 0, max: 0 } } }, definitions, 'dm')).toEqual([]);
  });
});
