import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import type { SightRules } from '../../src/app/vision/sightRules';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

function setup(tokens: Record<string, TokenEntity>, lighting: Partial<SceneLighting> = {}, onSightChange?: () => void, rules?: SightRules): { fallback: CanvasLightingFallback; viewport: Container; store: ViewAtlasStore } {
  restore = stubJsdomGraphics();
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `canvas-lighting-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  store.getState().setSceneLighting({ enabled: true, ...lighting });
  const viewport = new Container();
  const fallback = new CanvasLightingFallback({
    viewport: viewport as unknown as Viewport,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds: () => ({ width: 1000, height: 1000 }),
    ...(onSightChange && { onSightChange }),
    ...(rules && { rules: () => rules }),
  });
  return { fallback, viewport, store };
}

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };

describe('CanvasLightingFallback', () => {
  it('works sight out by the senses and conditions of the map\'s collection', () => {
    const seer: TokenEntity = { ...hero, vision: { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }, { id: 'blindsight', range: 10 }] }, conditions: ['blind'] };
    const generic = setup({ seer }).fallback.currentSight();
    expect(generic.regions.map((region) => region.sense.id)).toEqual(['sight', 'blindsight']);
    restore?.();
    const rules: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
    const pathfinder = setup({ seer }, {}, undefined, rules).fallback.currentSight();
    expect(pathfinder.regions.map((region) => region.sense.id)).toEqual(['blindsight']);
    restore?.();
    const sighted = setup({ seer: { ...seer, conditions: [] } }, {}, undefined, rules).fallback.currentSight();
    expect(sighted.regions.map((region) => region.sense.id)).toEqual(['sight', 'pathfinder2e-darkvision', 'blindsight']);
  });

  it('cuts the darkness open at a party token no sense shows, and at a token that only a precise creature sense sees', () => {
    const rules: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
    const bat: TokenEntity = { ...hero, vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 40 }] }, conditions: ['blind'] };
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };
    /** The centres of the footprints cut out: each is the polygon of what its token's centre has in a clear line. */
    const cuts = (tokens: Record<string, TokenEntity>): number[][] => {
      const poly = vi.spyOn(Graphics.prototype, 'poly');
      setup(tokens, {}, undefined, rules);
      const centres = poly.mock.calls.map(([points]) => {
        const flat = points as number[];
        const xs = flat.filter((_, index) => index % 2 === 0);
        const ys = flat.filter((_, index) => index % 2 === 1);
        return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2), Math.round((Math.max(...xs) - Math.min(...xs)) / 2)];
      });
      poly.mockRestore();
      restore?.();
      return centres;
    };
    // The bat is blinded: it is shown in its own footprint, like the prey its echolocation finds.
    expect(cuts({ bat })).toEqual([[100, 100, 31]]);
    expect(cuts({ bat, prey })).toEqual([[100, 100, 31], [150, 100, 31]]);
    expect(cuts({ bat, prey: { ...prey, x: 900 } })).toEqual([[100, 100, 31]]);
  });

  it('blacks out the map outside sight in the player frame only', () => {
    const { fallback, viewport } = setup({ hero });
    const darkness = viewport.children[0]!;
    expect(darkness.visible).toBe(false);
    fallback.modeLayer.visible = true;
    expect(darkness.visible).toBe(true);
    expect(fallback.currentSight().all).toBe(false);
    fallback.modeLayer.visible = false;
    expect(darkness.visible).toBe(false);
  });

  it('reports the sight it worked out, at the start and when a token moves', () => {
    const seen: number[] = [];
    const onSightChange = vi.fn();
    const { fallback, store } = setup({ hero }, {}, onSightChange);
    expect(onSightChange).toHaveBeenCalledTimes(1);
    onSightChange.mockImplementation(() => seen.push(fallback.currentSight().regions[0]!.origin.x));
    store.getState().updateToken('hero', { x: 300 });
    expect(seen).toEqual([300]);
  });

  it('keeps a held vision token\'s sight where it was taken until it is let go', () => {
    const { fallback, store } = setup({ hero });
    holdTokens(store, ['hero']);
    store.getState().setTokenPositions([{ id: 'hero', x: 300, y: 100 }]);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 100, y: 100 }]);
    holdTokens(store, []);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 300, y: 100 }]);
  });

  it('follows a held vision token when the scene switches sight on drop off', () => {
    const { fallback, store } = setup({ hero }, { sightOnDrop: false });
    holdTokens(store, ['hero']);
    store.getState().setTokenPositions([{ id: 'hero', x: 300, y: 100 }]);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 300, y: 100 }]);
  });

  it('renders a thumbnail in the GM view while the canvas shows the players, and leaves the canvas on theirs', () => {
    const { fallback, viewport } = setup({ hero });
    const darkness = viewport.children[0]!;
    fallback.modeLayer.visible = true;
    expect(darkness.visible).toBe(true);
    expect(fallback.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, () => darkness.visible)).toBe(false);
    expect(darkness.visible).toBe(true);
    expect(() => fallback.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, () => { throw new Error('Render failed'); })).toThrow('Render failed');
    expect(darkness.visible).toBe(true);
  });

  it('hides nothing while no token has vision', () => {
    const { fallback } = setup({});
    expect(fallback.currentSight().all).toBe(true);
  });

  it('hides nothing by line of sight while the scene switches token vision off', () => {
    const { fallback, viewport } = setup({ hero }, { tokenVision: false });
    expect(fallback.currentSight().all).toBe(true);
    fallback.modeLayer.visible = true;
    expect((viewport.children[0] as Graphics).context.instructions).toHaveLength(0);
  });

  it('counts everything in sight as lit, whatever the scene\'s threshold, since it draws no light', () => {
    const { fallback } = setup({ hero }, { ambient: 0, litThreshold: 1 });
    const { ambient, litThreshold } = fallback.ambientLight();
    expect(ambient).toBeGreaterThanOrEqual(litThreshold ?? 0.25);
  });
});
