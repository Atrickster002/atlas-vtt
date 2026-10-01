import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import type { Container } from 'pixi.js';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, RESIZE_HANDLE_SIZE, tokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { AMMO, HP, STR } from '../mocks/resourceFixtures';

const LUCK = { ...AMMO, key: 'luck', name: 'Luck', field: 'luck', color: '#3898ec' };
const DEFINITIONS = [HP, STR, AMMO, LUCK];
const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0,
  resources: { hp: { current: 7, max: 10 }, str: { current: 14, max: 14 }, ammo: { current: 4, max: 6 }, luck: { current: 2, max: 5 } } };

let restoreGraphics: () => void;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => { restoreGraphics(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Lets the reveal and emphasis animations, which run on animation frames, reach their end. */
const settle = (): void => { vi.advanceTimersByTime(1000); };

function tokenUI(showResources = true): TokenUIRenderer {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wheels-${Math.random()}`);
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid, size: 70 },
    tokenSettings: { ...store.getState().tokenSettings, showResources } });
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = () => DEFINITIONS;
  return ui;
}
/** The anchor on the token's right edge and the wheels in it. */
const wheelsView = (ui: TokenUIRenderer): Container => (ui.getContainer().children[1] as Container).children[0] as Container;
const wheelSlots = (ui: TokenUIRenderer): ReturnType<TokenUIRenderer['getResourceSlots']> => ui.getResourceSlots().filter((slot) => slot.kind === 'wheel');

describe('resource wheels on a token', () => {
  it('shows two bars at rest and the wheels only while hovered or selected', () => {
    const ui = tokenUI();
    try {
      ui.update(hero, 62);
      expect(ui.getResourceSlots().map((slot) => [slot.key, slot.kind])).toEqual([['hp', 'bar'], ['str', 'bar'], ['ammo', 'wheel'], ['luck', 'wheel']]);
      expect(wheelsView(ui).visible).toBe(false);
      ui.setHoverState(true);
      settle();
      expect(wheelsView(ui).visible).toBe(true);
      ui.setHoverState(false);
      settle();
      expect(wheelsView(ui).visible).toBe(false);
      ui.setSelectionState(true);
      settle();
      expect(wheelsView(ui).visible).toBe(true);
    } finally { ui.destroy(); }
  });

  it('shows a wheel for a token without bars', () => {
    const ui = tokenUI();
    try {
      ui.update({ ...hero, resources: { luck: { current: 2, max: 5 } } }, 62);
      expect(ui.getResourceSlots().map((slot) => [slot.key, slot.kind])).toEqual([['luck', 'wheel']]);
      expect(ui.getContainer().visible).toBe(true);
      ui.setHoverState(true);
      settle();
      expect(wheelsView(ui).visible).toBe(true);
    } finally { ui.destroy(); }
  });

  it.each([1, 1.5, 2.5])('keeps the wheels clear of the resize button on any token size (%s)', (size) => {
    const ui = tokenUI();
    try {
      const sprite = computeTokenPixelSize(70, size);
      ui.update({ ...hero, size }, sprite);
      const handleReach = getTokenRingCenterRadius(sprite, 4, 1) + (RESIZE_HANDLE_SIZE / 2) * tokenUIScale(sprite);
      const wheelLeft = sprite / 2 + wheelSlots(ui)[0]!.left * ui.getUIScale();
      expect(wheelLeft).toBeGreaterThan(handleReach);
    } finally { ui.destroy(); }
  });

  it('never shows wheels in the player view', () => {
    const ui = tokenUI();
    try {
      ui.update(hero, 62, { showTokenNameplates: false });
      ui.setHoverState(true);
      ui.setSelectionState(true);
      settle();
      expect(wheelSlots(ui)).toEqual([]);
      expect(wheelsView(ui).children).toHaveLength(0);
    } finally { ui.destroy(); }
  });

  it('leaves no wheels once the map hides resources', () => {
    const ui = tokenUI(false);
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      settle();
      expect(ui.getResourceSlots()).toEqual([]);
    } finally { ui.destroy(); }
  });

  it('reports how far the bars reach below and the wheels to the right', () => {
    const ui = tokenUI();
    try {
      ui.update(hero, 62);
      const { below, right } = ui.getResourcesExtent();
      expect(below).toBeCloseTo(2 + 10 + 2 + 10);
      expect(right).toBeGreaterThan(20.4);
      ui.update({ ...hero, resources: { hp: { current: 7, max: 10 } } }, 62);
      expect(ui.getResourcesExtent().right).toBe(0);
    } finally { ui.destroy(); }
  });
});
