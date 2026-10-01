import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { ResourceStack } from '../../../src/app/pixi/token-renderer/resources/ResourceStack';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', color: '#dc2626', defeatedWhenSpent: false };
const AMMO = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', look: 'badge' as const, defeatedWhenSpent: false };

describe('ResourceStack', () => {
  // jsdom has no canvas: bar fills paint a gradient and badge text is measured on one.
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('lays out bars top to bottom and each badge centred below them', () => {
    const stack = new ResourceStack(null);
    stack.update([
      { definition: HP_RESOURCE, value: { current: 3, max: 8 } },
      { definition: STR, value: { current: 12, max: 14 } },
      { definition: AMMO, value: { current: 4, max: 6 } },
    ], 2, false);
    const slots = stack.layout();
    expect(slots.map((s) => [s.key, s.kind])).toEqual([['hp', 'bar'], ['str', 'bar'], ['ammo', 'badge']]);
    expect(slots[1]!.top).toBeGreaterThan(slots[0]!.top);
    expect(slots[2]!.top).toBeGreaterThan(slots[1]!.top);
    expect(slots[2]!.left + slots[2]!.width / 2).toBeCloseTo(0);
  });

  it('keeps a view per key and destroys only what disappeared', () => {
    const stack = new ResourceStack(null);
    stack.update([{ definition: HP_RESOURCE, value: { current: 3, max: 8 } }, { definition: STR, value: { current: 1, max: 1 } }], 0, false);
    const hpView = stack.view.children[0];
    stack.update([{ definition: HP_RESOURCE, value: { current: 2, max: 8 } }], 0, false);
    expect(stack.view.children).toHaveLength(1);
    expect(stack.view.children[0]).toBe(hpView);
  });
});
