import { describe, expect, it } from 'vitest';
import { buildResourceEdits } from '../../../src/app/resources/resourceEdits';

describe('buildResourceEdits', () => {
  const defaults = { hp: { current: 8, max: 8 } };

  it('marks a maximum that differs from the statblock as set by hand and clamps current', () => {
    const token = { resources: { hp: { current: 8, max: 8 } } };
    expect(buildResourceEdits(token, [{ key: 'hp', max: 5 }], defaults)).toEqual({ resources: { hp: { current: 5, max: 5 } }, overriddenMax: ['hp'] });
  });

  it('follows the statblock again when the maximum is cleared', () => {
    const token = { resources: { hp: { current: 3, max: 20 } }, overriddenMax: ['hp'] };
    expect(buildResourceEdits(token, [{ key: 'hp', max: undefined }], defaults)).toEqual({ resources: { hp: { current: 3, max: 8 } }, overriddenMax: undefined });
  });

  it('removes a resource without statblock default when cleared', () => {
    const token = { resources: { ammo: { current: 2, max: 6 } } };
    expect(buildResourceEdits(token, [{ key: 'ammo', max: undefined }], {})).toEqual({ resources: {}, overriddenMax: undefined });
  });

  it('adds a resource the token did not have yet', () => {
    expect(buildResourceEdits({}, [{ key: 'ammo', max: 6 }], {})).toEqual({ resources: { ammo: { current: 6, max: 6 } }, overriddenMax: ['ammo'] });
  });

  it('leaves a maximum that was not changed as it was', () => {
    const token = { resources: { hp: { current: 5, max: 8 } } };
    expect(buildResourceEdits(token, [{ key: 'hp', max: 8 }], {})).toEqual({ resources: { hp: { current: 5, max: 8 } }, overriddenMax: undefined });
    const overridden = { resources: { hp: { current: 5, max: 20 } }, overriddenMax: ['hp'] };
    expect(buildResourceEdits(overridden, [{ key: 'hp', max: 20 }], defaults).overriddenMax).toEqual(['hp']);
  });
});
