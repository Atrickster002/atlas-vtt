import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { SENSED_OUTLINE_Z_INDEX, SensedOutlines } from '../../src/app/pixi/token-renderer/SensedOutlines';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

describe('SensedOutlines', () => {
  let restore: () => void;
  let outlines: SensedOutlines;

  beforeEach(() => {
    restore = stubJsdomGraphics();
    outlines = new SensedOutlines();
  });

  afterEach(() => {
    outlines.destroy();
    restore();
  });

  it('is a layer between the lighting and the token UI that shows only once it is switched on and takes no pointer', () => {
    expect(outlines.view.visible).toBe(false);
    expect(outlines.view.eventMode).toBe('none');
    expect(SENSED_OUTLINE_Z_INDEX).toBeGreaterThan(90);
    expect(SENSED_OUTLINE_Z_INDEX).toBeLessThan(100);
    expect(outlines.view.zIndex).toBe(SENSED_OUTLINE_Z_INDEX);
  });

  it('draws one outline per sensed token, at the token and as wide as it', () => {
    outlines.sync([{ id: 'a', x: 100, y: 200, size: 62 }, { id: 'b', x: 300, y: 50, size: 124 }]);
    expect(outlines.shown()).toEqual(['a', 'b']);
    const [a, b] = outlines.view.children as Graphics[];
    expect([a!.x, a!.y]).toEqual([100, 200]);
    expect(a!.getLocalBounds().width).toBeGreaterThan(60);
    expect(a!.getLocalBounds().width).toBeLessThan(66);
    expect(b!.getLocalBounds().width).toBeGreaterThan(122);
    expect(b!.getLocalBounds().width).toBeLessThan(128);
  });

  it('moves an outline with its token without drawing it again, and draws it again when the token changes size', () => {
    outlines.sync([{ id: 'a', x: 100, y: 200, size: 62 }]);
    const graphics = outlines.view.children[0] as Graphics;
    const drawn = graphics.context;
    const instructions = drawn.instructions.length;
    outlines.sync([{ id: 'a', x: 140, y: 210, size: 62 }]);
    expect(outlines.view.children[0]).toBe(graphics);
    expect([graphics.x, graphics.y]).toEqual([140, 210]);
    expect(graphics.context.instructions).toHaveLength(instructions);
    outlines.sync([{ id: 'a', x: 140, y: 210, size: 124 }]);
    expect(graphics.getLocalBounds().width).toBeGreaterThan(122);
  });

  it('removes the outline of a token that is no longer sensed', () => {
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62 }, { id: 'b', x: 10, y: 10, size: 62 }]);
    const gone = outlines.view.children[0] as Graphics;
    outlines.sync([{ id: 'b', x: 10, y: 10, size: 62 }]);
    expect(outlines.shown()).toEqual(['b']);
    expect(outlines.view.children).toHaveLength(1);
    expect(gone.destroyed).toBe(true);
    outlines.sync([]);
    expect(outlines.view.children).toHaveLength(0);
  });
});
