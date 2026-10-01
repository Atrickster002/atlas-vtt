import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Container, EventSystem, Text } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { GmSightAids, SIGHT_AIDS_Z_INDEX } from '../../src/app/pixi/lighting/GmSightAids';
import { restingTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore, type TokenInput, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { Perception } from '../../src/app/vision/perception';
import { SEES_ALL } from '../../src/app/vision/sight';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

interface Setup {
  aids: GmSightAids;
  store: ViewAtlasStore;
  viewport: Viewport;
  /** How the players perceive each token; unnamed tokens are seen. */
  perceived: Record<string, Perception>;
  /** How often the perception was asked for: once per update. */
  asked: () => number;
  add: (x: number, vision?: TokenEntity['vision']) => string;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.className = '';
});

function setup(): Setup {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `gm-sight-aids-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/aids.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const perceived: Record<string, Perception> = {};
  const perception = vi.fn(() => (id: string): Perception => perceived[id] ?? 'seen');
  const aids = new GmSightAids({
    viewport,
    store,
    measurement,
    bounds: () => ({ width: 4000, height: 4000 }),
    rules: () => GENERIC_SIGHT_RULES,
    lighting: { isEnabled: () => store.getState().lighting.enabled, currentSight: () => SEES_ALL, ambientLight: () => ({ ambient: 1 }), lightReaches: () => [] },
    perception: () => (store.getState().lighting.enabled ? perception() : undefined),
    frames: () => window,
  });
  cleanup = () => {
    aids.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const add = (x: number, vision?: TokenEntity['vision']): string =>
    store.getState().addToken({ kind: 'character', name: 'Mirabel', imagePath: 't.png', x, y: 500, size: 1, ...(vision && { vision }) } as TokenInput);
  return { aids, store, viewport, perceived, asked: () => perception.mock.calls.length, add };
}

/** The texts of the ring labels, in the order they are drawn. */
const labels = (aids: GmSightAids): string[] => aids.rings.labels();

describe('the ranges of a selected vision token', () => {
  const SENSES = { enabled: true, range: 60, senses: [{ id: 'darkvision', range: 30 }, { id: 'tremorsense', range: 15 }] };

  it('are a labelled ring for its sight and each sense with a distance, and the names of those without one', () => {
    const { aids, store, add } = setup();
    const id = add(500, SENSES);
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    store.getState().setSelection([id]);
    aids.update();
    expect(aids.rings.view.visible).toBe(true);
    expect(labels(aids)).toEqual(['Sight 60ft', 'Darkvision 30ft', 'Tremorsense 15ft']);
    expect(aids.rings.rings()[0]!.rings.map((ring) => [ring.radius, ring.style])).toEqual([[840, 'sight'], [420, 'sense'], [210, 'creatures']]);
    store.getState().setSelection([add(900, { enabled: true, senses: [{ id: 'low-light-vision' }, { id: 'darkvision', range: 30 }] })]);
    aids.update();
    expect(labels(aids)).toEqual(['Darkvision 30ft', 'No limit: Sight, Low-light vision']);
    // What has no limit is named beside the token, down and to the right of its rim.
    const noLimit = aids.rings.view.children[1]!.children[1]!;
    expect(noLimit.x).toBeCloseTo(900 + (31 + 12) * Math.SQRT1_2);
    expect(noLimit.y).toBeCloseTo(500 + (31 + 12) * Math.SQRT1_2);
    expect(noLimit.pivot.x).toBeLessThan(0);
  });

  it('are drawn for vision tokens only, on a lit scene, and for a handful of tokens at most', () => {
    const { aids, store, add } = setup();
    const plain = add(100);
    const seeing = [200, 300, 400, 500, 600].map((x) => add(x, SENSES));
    store.getState().setSelection([plain]);
    aids.update();
    expect(labels(aids)).toEqual([]);
    store.getState().setSelection(seeing);
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    store.getState().setSelection(seeing.slice(0, 2));
    aids.update();
    expect(labels(aids)).toHaveLength(6);
    store.getState().setSceneLighting({ enabled: false });
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    expect(labels(aids)).toEqual([]);
  });

  it('keep their labels at one size on screen, and keep a label while its text stays', () => {
    const { aids, store, viewport, add } = setup();
    const id = add(500, SENSES);
    store.getState().setSelection([id]);
    aids.update();
    const before = aids.rings.view.children[1]!.children.slice();
    expect(before[0]!.scale.x).toBe(1);
    viewport.scale.set(4);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    const after = aids.rings.view.children[1]!.children;
    expect(after).toEqual(before);
    expect(after[0]!.scale.x).toBe(0.25);
    // Another range is another label; the others stay.
    store.getState().updateToken(id, { vision: { ...SENSES, range: 40 } });
    aids.update();
    expect(labels(aids).sort()).toEqual(['Darkvision 30ft', 'Sight 40ft', 'Tremorsense 15ft']);
    expect(before[0]!.destroyed).toBe(true);
    expect(before[1]!.destroyed).toBe(false);
  });

  it('follow the theme', () => {
    const { aids, store, add } = setup();
    store.getState().setSelection([add(500, SENSES)]);
    aids.update();
    const light = aids.rings.view.children[1]!.children[0]!;
    document.body.classList.add('theme-dark');
    aids.update();
    expect(light.destroyed).toBe(true);
    const text = (aids.rings.view.children[1]!.children[0] as Container).children[1] as Text;
    expect(text.style.fill).toBe(0xffffff);
  });
});

describe('the marks on tokens the players do not see', () => {
  it('sit on the edge of every token the players do not see, by kind, at the size of token UI', () => {
    const { aids, perceived, add } = setup();
    const unseen = add(100);
    const sensed = add(300);
    add(500);
    perceived[unseen] = 'unseen';
    perceived[sensed] = 'sensed';
    aids.update();
    expect(aids.marks.shown()).toEqual([[unseen, 'unseen'], [sensed, 'sensed']]);
    const [first, second] = aids.marks.view.children as Container[];
    // A medium token on a 70 px grid is 62 across: the mark sits on its rim, up and to the right.
    expect(first!.x).toBeCloseTo(100 + 31 * Math.SQRT1_2);
    expect(first!.y).toBeCloseTo(500 - 31 * Math.SQRT1_2);
    expect(first!.scale.x).toBe(restingTokenUIScale(70));
    expect(second!.x).toBeCloseTo(300 + 31 * Math.SQRT1_2);
    // Over the lighting, under the token UI, and never in the pointer's way.
    expect(aids.view.zIndex).toBe(SIGHT_AIDS_Z_INDEX);
    expect(SIGHT_AIDS_Z_INDEX).toBeGreaterThan(90);
    expect(SIGHT_AIDS_Z_INDEX).toBeLessThan(100);
    expect(aids.view.eventMode).toBe('none');
  });

  it('keep a mark while its token stays unseen, draw it anew when it is sensed instead, and take it away when it is seen', () => {
    const { aids, store, perceived, add } = setup();
    const id = add(100);
    perceived[id] = 'unseen';
    aids.update();
    const mark = aids.marks.view.children[0]!;
    store.getState().updateToken(id, { x: 140 });
    aids.update();
    expect(aids.marks.view.children[0]).toBe(mark);
    expect(mark.x).toBeCloseTo(140 + 31 * Math.SQRT1_2);
    perceived[id] = 'sensed';
    aids.update();
    expect(mark.destroyed).toBe(true);
    expect(aids.marks.shown()).toEqual([[id, 'sensed']]);
    perceived[id] = 'seen';
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
    expect(aids.marks.view.visible).toBe(false);
  });

  it('are none on a hidden token, on an unlit scene and while a map loads', () => {
    const { aids, store, perceived, add } = setup();
    const id = add(100);
    const hidden = add(300);
    perceived[id] = 'unseen';
    perceived[hidden] = 'unseen';
    store.getState().updateToken(hidden, { isHidden: true });
    aids.update();
    expect(aids.marks.shown()).toEqual([[id, 'unseen']]);
    store.setState({ isMapLoading: true });
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
    store.setState({ isMapLoading: false });
    store.getState().setSceneLighting({ enabled: false });
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
  });

  it('are drawn in the theme\'s badge colours, anew when the theme changes', async () => {
    const { aids, perceived, add } = setup();
    perceived[add(100)] = 'unseen';
    aids.update();
    const light = aids.marks.view.children[0]!;
    document.body.classList.add('theme-dark');
    await vi.waitFor(() => expect(light.destroyed).toBe(true));
    expect(aids.marks.shown()).toHaveLength(1);
  });
});

describe('GmSightAids', () => {
  it('works the marks out once per frame, however many changes arrive, and again when the sight changed', async () => {
    const { aids, store, perceived, asked, add } = setup();
    const id = add(100);
    await nextFrame();
    const before = asked();
    perceived[id] = 'unseen';
    for (let x = 101; x < 110; x++) store.getState().updateToken(id, { x });
    aids.schedule();
    expect(aids.marks.shown()).toEqual([]);
    await nextFrame();
    expect(asked()).toBe(before + 1);
    expect(aids.marks.shown()).toEqual([[id, 'unseen']]);
    // No change, no work.
    await nextFrame();
    expect(asked()).toBe(before + 1);
    perceived[id] = 'seen';
    aids.schedule();
    await nextFrame();
    expect(aids.marks.shown()).toEqual([]);
  });

  it('shows nothing while the canvas shows the players\' view, and all of it again after', () => {
    const { aids, store, perceived, add } = setup();
    const unseen = add(100);
    const seeing = add(500, { enabled: true, range: 60 });
    perceived[unseen] = 'unseen';
    store.getState().setSelection([seeing]);
    aids.update();
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([true, true]);
    expect(aids.sightLine(unseen)).toBe('Bright light · Seen by the players');
    aids.setSuppressed(true);
    expect(aids.view.visible).toBe(false);
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([false, false]);
    expect(aids.marks.shown()).toEqual([]);
    expect(aids.sightLine(unseen)).toBeNull();
    // Session view hides the layer through the players' list; the GM's view has it back.
    aids.view.visible = false;
    aids.setSuppressed(false);
    expect(aids.view.visible).toBe(true);
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([true, true]);
  });

  it('words a hover line for the token renderer on a lit scene, and refreshes an open card with every update', () => {
    const { aids, store, add } = setup();
    const id = add(100);
    const party = add(300, { enabled: true });
    const refresh = vi.fn();
    let provider: ((tokenId: string) => string | null) | null = null;
    aids.wire({ setSightLineProvider: (fn) => { provider = fn; return refresh; } });
    expect(provider!(id)).toBe('Bright light · Seen by the players');
    expect(provider!(party)).toBe('Bright light · Always shown to the players');
    expect(provider!('gone')).toBeNull();
    aids.update();
    expect(refresh).toHaveBeenCalledTimes(1);
    store.getState().setSceneLighting({ enabled: false });
    expect(provider!(id)).toBeNull();
    cleanup!();
    cleanup = null;
    expect(provider).toBeNull();
  });
});
