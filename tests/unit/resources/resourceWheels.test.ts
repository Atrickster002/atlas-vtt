import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { ResourceWheels, WHEEL_SIZE } from '../../../src/app/pixi/token-renderer/resources/ResourceWheels';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const AMMO = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', color: '#f59e0b', defeatedWhenSpent: false };
const LUCK = { ...HP_RESOURCE, key: 'luck', name: 'Luck', color: '#3898ec', defeatedWhenSpent: false };
const texts = (node: Container): Text[] => node.children.flatMap((child) => (child instanceof Text ? [child] : texts(child as Container)));

describe('ResourceWheels', () => {
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('stacks slot 3 above the middle line and slot 4 below it, past the clearance', () => {
    const wheels = new ResourceWheels();
    wheels.setClearance(13.5);
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }, { definition: LUCK, value: { current: 2, max: 5 }, slot: 3 }]);
    const [upper, lower] = wheels.layout();
    expect([upper!.key, upper!.kind, lower!.key]).toEqual(['ammo', 'wheel', 'luck']);
    expect(upper!.left).toBe(13.5);
    expect(upper!.top + upper!.height).toBeLessThan(0);
    expect(lower!.top).toBeGreaterThan(0);
    expect(upper!.width).toBe(WHEEL_SIZE);
    expect(wheels.extent()).toBeGreaterThan(13.5 + WHEEL_SIZE);
    wheels.destroy();
  });

  it('keeps a lone slot-4 wheel in its own place and follows a new clearance', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: LUCK, value: { current: 2, max: 5 }, slot: 3 }]);
    expect(wheels.layout()[0]!.top).toBeGreaterThan(0);
    wheels.setClearance(23.5);
    expect(wheels.layout()[0]!.left).toBe(23.5);
    wheels.update([]);
    expect(wheels.layout()).toEqual([]);
    expect(wheels.extent()).toBe(0);
    wheels.destroy();
  });

  it('shows the current value and stays hidden until revealed', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }]);
    expect(texts(wheels.view).map((text) => text.text)).toEqual(['4']);
    expect(wheels.view.visible).toBe(false);
    wheels.setAlpha(0.5);
    expect([wheels.view.visible, wheels.view.alpha]).toEqual([true, 0.5]);
    wheels.destroy();
  });

  it('shrinks the number so long values stay inside the disc', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }]);
    const short = texts(wheels.view)[0]!.scale.x;
    wheels.update([{ definition: AMMO, value: { current: 250, max: 250 }, slot: 2 }]);
    expect(texts(wheels.view)[0]!.scale.x).toBeLessThan(short);
    wheels.destroy();
  });
});
