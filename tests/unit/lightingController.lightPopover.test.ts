import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { genericLight } from '../mocks/lights';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { DoorMenuHandlers, TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { SEES_ALL } from '../../src/app/vision/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => ({
    modeLayer: { visible: false },
    isEnabled: () => deps.store.getState().lighting.enabled,
    currentSight: () => SEES_ALL,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: vi.fn(),
    resetExplored: vi.fn(),
    beforeMapUnload: vi.fn(),
    renderForFrame: (_frame, render) => render(),
    destroy: vi.fn(),
  }),
}));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));

interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  obsApp: ReturnType<typeof createInMemoryApp>['app'];
  eventBus: EventEmitter;
  viewport: Viewport;
  light: LightPointerHandlers;
  wallDown: (x: number, y: number, e: FederatedPointerEvent) => boolean;
  contextMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  /** A torch at (400, 300) and a lantern at (600, 300). */
  torch: string;
  lantern: string;
  click: (x: number, y: number, keys?: { shift?: boolean }) => boolean;
}

const doorMenu: { current: DoorMenuHandlers | null } = { current: null };
let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  openContextMenuGlobal.mockReset();
});

function event(x: number, y: number, keys: { shift?: boolean } = {}): FederatedPointerEvent {
  return { global: { x, y }, shiftKey: !!keys.shift, ctrlKey: false, metaKey: false, altKey: false } as FederatedPointerEvent;
}

function setup(): Setup {
  const restoreGraphics = stubJsdomGraphics();
  window.matchMedia = (() => ({ matches: true })) as never;
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const events = { domElement: canvas } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `light-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/popover.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const eventBus = new EventEmitter();
  const controller = new LightingController({
    viewport, app: { canvas } as unknown as Application, store, eventBus, obsApp, viewId: 'popover-view',
    bounds: () => ({ width: 1000, height: 1000 }), albedo: () => null,
  });
  const wired = {} as Pick<Setup, 'light' | 'wallDown' | 'contextMenu'>;
  const ignore = (): void => undefined;
  const sensedOutlines = { visible: false };
  controller.wire({
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setWallPointerDownHandler: (fn: Setup['wallDown']) => { wired.wallDown = fn; },
    setWallContextMenuHandler: (fn: Setup['contextMenu']) => { wired.contextMenu = fn; },
    setWallPointerMoveHandler: ignore, setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore,
    setDoorMenuHandlers: (handlers: DoorMenuHandlers) => { doorMenu.current = handlers; },
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, refreshPlayerSight: ignore,
    getSensedOutlineLayer: () => sensedOutlines,
    setSightLineProvider: () => ignore,
  } as unknown as TokenRenderer);
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  const lantern = store.getState().addLight({ x: 600, y: 300, emission: { ...genericLight('lantern'), kind: 'lantern' } });
  getHistoryStore(store)!.getState().clear();
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    canvas.remove();
    restoreGraphics();
  };
  const click = (x: number, y: number, keys: { shift?: boolean } = {}): boolean => {
    const taken = wired.light.pointerDown(x, y, event(x, y, keys));
    viewport.emit('pointerup', {} as never);
    return taken;
  };
  return { controller, store, obsApp, eventBus, viewport, ...wired, torch, lantern, click };
}

describe('opening a light', () => {
  it('opens its popover on a click on its marker, with the select tool', () => {
    const { store, torch, click } = setup();
    expect(click(400, 300)).toBe(true);
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('moves the one popover to another light that is clicked', () => {
    const { store, lantern, click } = setup();
    click(400, 300);
    click(600, 300);
    expect(store.getState().lightPopover).toBe(lantern);
  });

  it('opens from the lighting tool\'s context menu, which a right-click keeps', () => {
    const { store, torch, contextMenu } = setup();
    store.getState().setActiveTool('wall');
    contextMenu(400, 300, 10, 10);
    const entries = openContextMenuGlobal.mock.calls[0]![0] as { label: string; onClick: () => void }[];
    entries.find((entry) => entry.label === 'Configure light…')!.onClick();
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('does not place another light on a marker with the lighting tool, and opens it instead', () => {
    const { store, eventBus, torch, click, wallDown } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'place-light');
    expect(click(400, 300)).toBe(true);
    expect(Object.keys(store.getState().objects.lights)).toHaveLength(2);
    expect(store.getState().lightPopover).toBe(torch);
    // Off the markers the tool places one, with its kind.
    wallDown(100, 100, event(100, 100));
    const placed = Object.values(store.getState().objects.lights).find((light) => light.x === 100);
    expect(placed?.emission.kind).toBe('torch');
  });

  it('leaves a press to the lighting tool where a wall handle is, and with Shift, which draws past lights', () => {
    const { store, light, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().addWall({ type: 'solid', p1: { x: 402, y: 300 }, p2: { x: 402, y: 500 }, closed: true });
    expect(click(400, 300)).toBe(false);
    expect(light.cursorAt(400, 300)).toBeNull();
    expect(click(600, 300, { shift: true })).toBe(false);
    expect(click(600, 300)).toBe(true);
  });

  it('is not possible in session view, where the markers are hidden', () => {
    const { store, click } = setup();
    store.getState().setGMView(false);
    expect(click(400, 300)).toBe(false);
    expect(store.getState().lightPopover).toBeNull();
  });
});

describe('closing the light popover', () => {
  it('closes on Escape, before the key is the wall editor\'s', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    expect(controller.handleEscape()).toBe(true);
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleEscape()).toBe(false);
  });

  it('cancels a ring drag under way with Escape, putting the range back', () => {
    const { controller, store, light, viewport, torch } = setup();
    store.getState().openLightPopover(torch);
    light.pointerDown(400, 20, event(400, 20));
    viewport.emit('pointermove', event(400, 90) as never);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(15);
    expect(controller.handleEscape()).toBe(true);
    viewport.emit('pointermove', event(400, 230) as never);
    expect(store.getState().lightPopover).toBeNull();
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('cancels a light being dragged with Escape, putting it back', () => {
    const { controller, store, light, viewport, torch } = setup();
    store.getState().setActiveTool('wall');
    light.pointerDown(400, 300, event(400, 300));
    viewport.emit('pointermove', event(470, 330) as never);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 470, y: 330 });
    expect(controller.handleEscape()).toBe(true);
    viewport.emit('pointermove', event(600, 400) as never);
    viewport.emit('pointerup', {} as never);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when its light is deleted', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().deleteLight(torch);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when undo takes its light away', () => {
    const { store, click } = setup();
    const placed = store.getState().addLight({ x: 100, y: 100, emission: genericLight('candle') });
    click(100, 100);
    expect(store.getState().lightPopover).toBe(placed);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.lights[placed]).toBeUndefined();
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when the scene changes', () => {
    const { store, eventBus, torch } = setup();
    store.getState().openLightPopover(torch);
    eventBus.emit('map-unloading');
    expect(store.getState().lightPopover).toBeNull();
    store.getState().openLightPopover(torch);
    store.getState().setMapLoading(true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when a peek at the players\' view starts', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightPopover).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', bubbles: true }));
  });

  it('closes when another Obsidian tab becomes active, which a key can do without a press', () => {
    const { store, torch, obsApp } = setup();
    const onLeafChange = vi.mocked(obsApp.workspace.on).mock.calls.find(([event]) => event === 'active-leaf-change')![1] as (leaf: unknown) => void;
    const ownLeaf = { view: { viewId: 'popover-view' } };
    vi.mocked(obsApp.workspace.getLeavesOfType).mockReturnValue([ownLeaf] as never);
    store.getState().openLightPopover(torch);
    onLeafChange(ownLeaf);
    expect(store.getState().lightPopover).toBe(torch);
    onLeafChange({ view: { viewId: 'a-note' } });
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes in session view', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().setGMView(false);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when the scene\'s lighting goes off and takes the markers with it', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().setSceneLighting({ enabled: false });
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes on a press on the map off the lights', () => {
    const { store, torch, viewport } = setup();
    store.getState().openLightPopover(torch);
    (viewport.options.events.domElement as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
    expect(store.getState().lightPopover).toBeNull();
  });
});

describe('the range rings', () => {
  it('are one of the GM overlays the players\' view hides', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    const { rangeRings } = controller.gmOverlays();
    expect(rangeRings.visible).toBe(true);
    expect(controller.playerLayers()).toContainEqual({ layer: rangeRings, visible: false });
  });

  it('go with the popover when a peek starts, and stay away when it ends', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.gmOverlays().rangeRings.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(controller.gmOverlays().rangeRings.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('resize the open light from the map, as one undo step', () => {
    const { store, light, viewport, torch } = setup();
    store.getState().openLightPopover(torch);
    expect(light.cursorAt(400, 20)).toBe('ns-resize');
    expect(light.pointerDown(400, 20, event(400, 20))).toBe(true);
    viewport.emit('pointermove', event(400, 90) as never);
    viewport.emit('pointermove', event(400, 160) as never);
    viewport.emit('pointerup', {} as never);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(10);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });
});

describe('a picture of the scene (a thumbnail)', () => {
  const FRAME = { x: 0, y: 0, resolution: 0.5 };
  const PEEK = { key: 'h', code: 'KeyH', bubbles: true };

  /** The GM overlays' visibility: on the canvas before, in the picture, and on the canvas after. */
  function picture(controller: LightingController): Record<'before' | 'during' | 'after', Record<string, boolean>> {
    const shown = (): Record<string, boolean> => Object.fromEntries(Object.entries(controller.gmOverlays()).map(([name, layer]) => [name, layer.visible]));
    const before = shown();
    const during = captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, FRAME, shown);
    return { before, during, after: shown() };
  }
  const NONE = { wallEditor: false, lightZones: false, doorBadges: false, lightMarkers: false, rangeRings: false, sightAids: false };

  it('leaves the GM overlays out in GM view and has them back', () => {
    const { controller } = setup();
    const { before, during, after } = picture(controller);
    expect(before).toEqual({ wallEditor: false, lightZones: false, doorBadges: true, lightMarkers: true, rangeRings: false, sightAids: true });
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
  });

  it('leaves the wall editor out with the lighting tool', () => {
    const { controller, store } = setup();
    store.getState().setActiveTool('wall');
    const { before, during, after } = picture(controller);
    expect(before).toEqual({ wallEditor: true, lightZones: false, doorBadges: true, lightMarkers: true, rangeRings: false, sightAids: true });
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
  });

  it('leaves the range rings out while a light\'s popover is open, and has them back', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    const { before, during, after } = picture(controller);
    expect(before.rangeRings).toBe(true);
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('shows none of them in session view, and leaves the canvas in session view', () => {
    const { controller, store } = setup();
    store.getState().setGMView(false);
    const { before, during, after } = picture(controller);
    expect(before).toEqual(NONE);
    expect(during).toEqual(NONE);
    expect(after).toEqual(NONE);
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
  });

  it('shows none of them during a peek, and leaves the canvas in the players\' view', () => {
    const { controller } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    const { during, after } = picture(controller);
    expect(during).toEqual(NONE);
    expect(after).toEqual(NONE);
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });
});

describe('the lighting tool\'s zone mode', () => {
  it('shows the zones\' layer only with the lighting tool in that mode, never in the players\' view or a picture of the scene', () => {
    const { controller, store, eventBus } = setup();
    const shown = (): boolean => controller.gmOverlays().lightZones.visible;
    eventBus.emit('wall-submode-changed', 'light-zone');
    expect(shown()).toBe(false);
    store.getState().setActiveTool('wall');
    expect(shown()).toBe(true);
    expect(captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, { x: 0, y: 0, resolution: 0.5 }, shown)).toBe(false);
    store.getState().setGMView(false);
    expect(shown()).toBe(false);
    store.getState().setGMView(true);
    eventBus.emit('wall-submode-changed', 'draw');
    expect(shown()).toBe(false);
  });

  it('draws a zone with clicks that pass the lights and walls beneath them, closes it with Enter and edits it in its popover until the tool is left', () => {
    const { controller, store, eventBus, light, wallDown } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'light-zone');
    // The first corner lands on the torch's marker: the zone tool takes the press, not the light.
    for (const [x, y] of [[400, 300], [700, 300], [700, 500]] as const) {
      expect(light.pointerDown(x, y, event(x, y))).toBe(false);
      expect(wallDown(x, y, event(x, y))).toBe(true);
    }
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleEnter()).toBe(true);
    const [zone] = Object.values(store.getState().objects.lightZones ?? {});
    expect(zone?.polygon).toHaveLength(3);
    expect(store.getState().lightZonePopover).toBe(zone!.id);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(0);
    store.getState().setActiveTool('select');
    expect(store.getState().lightZonePopover).toBeNull();
    // With nothing to close Enter is not the lighting's.
    expect(controller.handleEnter()).toBe(false);
  });

  it('deletes the zone whose popover is open with Delete, and closes the popover with Escape', () => {
    const { controller, store, eventBus } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'light-zone');
    const id = store.getState().addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], ambient: 0 });
    store.getState().openLightZonePopover(id);
    expect(controller.handleEscape()).toBe(true);
    expect(store.getState().lightZonePopover).toBeNull();
    store.getState().openLightZonePopover(id);
    expect(controller.handleDelete()).toBe(true);
    expect(store.getState().objects.lightZones).toEqual({});
  });
});
