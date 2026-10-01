import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import { Container, EventBoundary, Rectangle, loadEnvironmentExtensions, updateRenderGroupTransforms } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, NAMEPLATE_HEIGHT, RESIZE_HANDLE_SIZE, tokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
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

type Store = ReturnType<typeof createViewAtlasStore>;

/** A token UI on a 70 px grid; with `zoom`, a selected token's UI grows to its constant size on screen. */
function tokenUI({ showResources = true, zoom }: { showResources?: boolean; zoom?: number } = {}): { ui: TokenUIRenderer; store: Store } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wheels-${Math.random()}`);
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid, size: 70 },
    tokenSettings: { ...store.getState().tokenSettings, showResources } });
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = () => DEFINITIONS;
  if (zoom !== undefined) ui.zoomProvider = () => zoom;
  return { ui, store };
}
/** The anchor the wheels hang from: past the resize button, on the token's bottom edge. */
const beside = (ui: TokenUIRenderer): Container => ui.getContainer().children[1] as Container;
const wheelsView = (ui: TokenUIRenderer): Container => beside(ui).children[0] as Container;
const wheelSlots = (ui: TokenUIRenderer): ReturnType<TokenUIRenderer['getResourceSlots']> => ui.getResourceSlots().filter((slot) => slot.kind === 'wheel');

describe('resource wheels on a token', () => {
  it('shows two bars at rest and the wheels only while hovered or selected', () => {
    const { ui } = tokenUI();
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
    const { ui } = tokenUI();
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
    const { ui } = tokenUI();
    try {
      const sprite = computeTokenPixelSize(70, size);
      ui.update({ ...hero, size }, sprite);
      const handleReach = getTokenRingCenterRadius(sprite, 4, 1) + (RESIZE_HANDLE_SIZE / 2) * tokenUIScale(sprite);
      const wheelLeft = beside(ui).position.x + wheelSlots(ui)[0]!.left * beside(ui).scale.x;
      expect(wheelLeft).toBeGreaterThan(handleReach);
    } finally { ui.destroy(); }
  });

  it('never shows wheels in the player view', () => {
    const { ui } = tokenUI();
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
    const { ui } = tokenUI({ showResources: false });
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      settle();
      expect(ui.getResourceSlots()).toEqual([]);
    } finally { ui.destroy(); }
  });

  it('keeps the wheel slots where they are when a selected token\'s UI grows', () => {
    const { ui } = tokenUI({ zoom: 1 });
    try {
      ui.update(hero, 62);
      const atRest = wheelSlots(ui);
      ui.setSelectionState(true);
      settle();
      expect(beside(ui).scale.x).toBeCloseTo(2.25);
      // The controls are laid out from these slots once, so they must not depend on the scale
      expect(wheelSlots(ui)).toEqual(atRest);
    } finally { ui.destroy(); }
  });

  it.each([2, 1, 0.5])('keeps the wheels above the nameplate and the bars at zoom %s', (zoom) => {
    const { ui } = tokenUI({ zoom });
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      settle();
      const scale = beside(ui).scale.x;
      const nameplateTop = 62 / 2 - NAMEPLATE_HEIGHT * scale;
      for (const slot of wheelSlots(ui)) {
        expect(beside(ui).position.y + (slot.top + slot.height) * scale).toBeLessThanOrEqual(nameplateTop + 1e-6);
      }
    } finally { ui.destroy(); }
  });

  it('moves the wheels with the ring when its size setting changes', () => {
    const { ui, store } = tokenUI();
    try {
      ui.update(hero, 62);
      const before = beside(ui).position.x;
      store.setState({ tokenSettings: { ...store.getState().tokenSettings, tokenRingSize: 1.5 } });
      ui.update(hero, 62);
      expect(beside(ui).position.x).toBeGreaterThan(before);
    } finally { ui.destroy(); }
  });

  it('reports how far the bars reach below and the wheels to the right', () => {
    const { ui } = tokenUI();
    try {
      ui.update(hero, 62);
      const { below, right, above } = ui.getResourcesExtent();
      expect(below).toBeCloseTo(2 + 10 + 2 + 10);
      expect(right).toBeGreaterThan(20.4);
      // At rest the wheels stay within the token's height
      expect(above).toBe(0);
      ui.update({ ...hero, resources: { hp: { current: 7, max: 10 } } }, 62);
      expect(ui.getResourcesExtent().right).toBe(0);
    } finally { ui.destroy(); }
  });

  it('reports the extents of the selected size at once, not of the size it is still growing from', () => {
    const { ui } = tokenUI({ zoom: 1 });
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      const early = ui.getResourcesExtent();
      settle();
      expect(early).toEqual(ui.getResourcesExtent());
      // The grown wheels rise above the token's top edge, and the frame must follow
      expect(early.above).toBeGreaterThan(0);
      expect(early.below).toBeCloseTo(24 * 2.25);
    } finally { ui.destroy(); }
  });

  it('puts a selected token\'s wheel controls on its wheels and leaves the bars\' buttons their clicks', async () => {
    await loadEnvironmentExtensions(false);
    const { ui, store } = tokenUI({ zoom: 1 });
    store.setState({ objects: { ...store.getState().objects, tokens: { hero } } });
    const canvas = document.body.createEl('canvas');
    const viewport = Object.assign(new Container(), { options: { events: { domElement: canvas } } }) as Viewport;
    viewport.eventMode = 'static';
    viewport.hitArea = new Rectangle(-1000, -1000, 2000, 2000);
    const stage = new Container({ isRenderGroup: true });
    stage.addChild(viewport);
    viewport.addChild(ui.getContainer());
    const controls = new TokenControlsUI(viewport, store);
    controls.resourceDefsProvider = () => DEFINITIONS;
    controls.slotsProvider = () => ui.getResourceSlots();
    ui.onScaleChange = (scale) => controls.setScaleFor('hero', scale);
    try {
      ui.update(hero, 62);
      // As the app does: the controls are shown when the selection changes, before the UI has grown
      controls.show('hero', 0, 0, 62, ui.getUIScale());
      ui.setSelectionState(true);
      settle();
      updateRenderGroupTransforms(stage.renderGroup!, true);

      const everything = (node: Container): Container[] => node.children.flatMap((child) => [child, ...everything(child)]);
      const hits = everything(controls.getContainer()).filter((c): c is ResourceBarHitArea => c instanceof ResourceBarHitArea);
      expect(hits).toHaveLength(4);
      type Rect = { left: number; top: number; width: number; height: number };
      const slotOf = (hit: ResourceBarHitArea): Rect => (hit as unknown as { slot: Rect }).slot;
      wheelsView(ui).children.forEach((wheel, index) => {
        const hit = hits[2 + index]!;
        const { left, top, width, height } = slotOf(hit);
        const control = hit.parent!.toGlobal({ x: left + width / 2, y: top + height / 2 });
        const drawn = wheel.getGlobalPosition();
        expect([control.x, control.y].map(Math.round)).toEqual([drawn.x, drawn.y].map(Math.round));
      });

      // The HP bar's + is the third control of its resource: click area, minus, plus
      const hpPlus = hits[0]!.parent!.children[hits[0]!.parent!.children.indexOf(hits[0]!) + 2]!;
      const at = hpPlus.getGlobalPosition();
      let target = new EventBoundary(stage).hitTest(at.x, at.y);
      while (target && target !== hpPlus && target.parent && target.parent !== hpPlus.parent) target = target.parent;
      expect(target).toBe(hpPlus);
    } finally { controls.destroy(); ui.destroy(); stage.destroy({ children: true }); }
  });
});
