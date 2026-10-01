import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { emissionOfPreset } from '../../src/app/lighting/lightEmissionForm';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { SEES_ALL, computeSight, type Sight } from '../../src/app/vision/sight';
import { AssetService } from '../../src/app/services/AssetService';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import type { TokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const lighting = vi.hoisted(() => ({
  sight: null as unknown,
  deps: null as unknown,
  modeLayer: { visible: false },
  refreshBounds: (): void => {},
}));

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
    lighting.deps = deps;
    lighting.modeLayer = { visible: false };
    lighting.refreshBounds = vi.fn();
    return {
      modeLayer: lighting.modeLayer,
      isEnabled: () => deps.store.getState().lighting.enabled,
      currentSight: () => lighting.sight as Sight,
      lightReaches: () => [],
      ambientLight: () => ({ ambient: 1 }),
      refreshBounds: () => lighting.refreshBounds(),
      resetExplored: vi.fn(),
      beforeMapUnload: vi.fn(),
      renderForFrame: (_frame, render) => render(),
      destroy: vi.fn(),
    };
  },
}));

vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));

/** What `LightingController.wire` hands the token renderer's viewport dispatch. */
interface Wired {
  pointerDown: (x: number, y: number, e: FederatedPointerEvent) => boolean;
  pointerMove: (x: number, y: number, e: FederatedPointerEvent) => void;
  pointerUp: () => void;
  doubleClick: () => void;
  light: LightPointerHandlers;
  contextMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  cursor: (x: number, y: number) => string;
  doorClick: (x: number, y: number) => boolean;
  playerSight: () => ((tokenId: string) => string) | undefined;
  refreshPlayerSight: ReturnType<typeof vi.fn>;
  /** The layer of the sensed tokens' outlines, as the token renderer gives it. */
  sensedOutlines: { visible: boolean };
}

interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  obsApp: App;
  /** Tells the controller a collection's settings changed, as `AssetService` does through the workspace. */
  collectionSettingsChanged: () => void;
  wired: Wired;
  click: (x: number, y: number, keys?: { shift?: boolean }) => boolean;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

function setup(extra: Partial<ConstructorParameters<typeof LightingController>[0]> = {}): Setup {
  const restoreGraphics = stubJsdomGraphics();
  lighting.sight = SEES_ALL;
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `lighting-session-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/session.atlasmap');
  const eventBus = new EventEmitter();
  const controller = new LightingController({
    viewport,
    app: { canvas: document.createElement('canvas') } as unknown as Application,
    store,
    eventBus,
    obsApp,
    viewId: 'session-view',
    bounds: () => ({ width: 1000, height: 1000 }),
    albedo: () => null,
    ...extra,
  });
  const wired = { refreshPlayerSight: vi.fn(), sensedOutlines: { visible: false } } as Wired;
  controller.wire({
    setWallPointerDownHandler: (fn: Wired['pointerDown']) => { wired.pointerDown = fn; },
    setWallPointerMoveHandler: (fn: Wired['pointerMove']) => { wired.pointerMove = fn; },
    setWallPointerUpHandler: (fn: Wired['pointerUp']) => { wired.pointerUp = fn; },
    setWallDoubleClickHandler: (fn: Wired['doubleClick']) => { wired.doubleClick = fn; },
    setWallContextMenuHandler: (fn: Wired['contextMenu']) => { wired.contextMenu = fn; },
    setWallCursorProvider: (fn: Wired['cursor']) => { wired.cursor = fn; },
    setDoorClickHandler: (fn: Wired['doorClick']) => { wired.doorClick = fn; },
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setPlayerSightProvider: (fn: Wired['playerSight']) => { wired.playerSight = fn; },
    refreshPlayerSight: wired.refreshPlayerSight,
    getSensedOutlineLayer: () => wired.sensedOutlines,
  } as unknown as TokenRenderer);
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const click = (x: number, y: number, keys: { shift?: boolean } = {}): boolean =>
    wired.pointerDown(x, y, { shiftKey: !!keys.shift, ctrlKey: false, metaKey: false } as FederatedPointerEvent);
  const collectionSettingsChanged = (): void => {
    const calls = vi.mocked(obsApp.workspace.on).mock.calls as unknown as [string, (collectionId: string) => void][];
    calls.find(([name]) => name === 'atlas-vtt:collection-settings-changed')?.[1]('dungeon');
  };
  return { controller, store, eventBus, obsApp, collectionSettingsChanged, wired, click };
}

function addWall(store: ViewAtlasStore, x1: number, x2: number): string {
  return store.getState().addWall({ type: 'solid', p1: { x: x1, y: 100 }, p2: { x: x2, y: 100 }, closed: true });
}

function pressPeek(type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { key: 'h', code: 'KeyH', bubbles: true }));
}

describe('LightingController in session view', () => {
  it('shows the GM his overlays in GM view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const { wallEditor, doorBadges, lightMarkers } = controller.gmOverlays();
    expect(lighting.modeLayer.visible).toBe(false);
    expect(wallEditor.visible).toBe(false);
    expect(doorBadges.visible).toBe(true);
    expect(lightMarkers.visible).toBe(true);
    store.getState().setActiveTool('wall');
    expect(wallEditor.visible).toBe(true);
  });

  it('hides in session view exactly what a player frame hides, and switches to the players\' lighting', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    const layers = controller.playerLayers();
    expect(layers).toHaveLength(6);
    for (const { layer, visible } of layers) expect(layer.visible).toBe(visible);
    expect(lighting.modeLayer.visible).toBe(true);
  });

  it('shows the outlines of sensed tokens in session view and while peeking, never in GM view or an unlit scene', () => {
    const { store, wired } = setup();
    store.getState().setSceneLighting({ enabled: true });
    expect(wired.sensedOutlines.visible).toBe(false);
    store.getState().setGMView(false);
    expect(wired.sensedOutlines.visible).toBe(true);
    store.getState().setGMView(true);
    expect(wired.sensedOutlines.visible).toBe(false);
    pressPeek('keydown');
    expect(wired.sensedOutlines.visible).toBe(true);
    pressPeek('keyup');
    expect(wired.sensedOutlines.visible).toBe(false);
    store.getState().setGMView(false);
    store.getState().setSceneLighting({ enabled: false });
    expect(wired.sensedOutlines.visible).toBe(false);
  });

  it('keeps them hidden when lights change, a door opens or the tool changes in session view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    store.getState().addLight({ x: 50, y: 50, emission: emissionOfPreset('torch') });
    const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, closed: true });
    store.getState().toggleDoor(door);
    store.getState().setActiveTool('wall');
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    store.getState().setSceneLighting({ enabled: false });
    for (const layer of Object.values(controller.gmOverlays())) expect(layer.visible).toBe(false);
  });

  it('gives the overlays back with GM view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    store.getState().setGMView(true);
    expect(lighting.modeLayer.visible).toBe(false);
    expect(controller.gmOverlays().doorBadges.visible).toBe(true);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });

  it('shows the same while the peek key is held', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    pressPeek('keydown');
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    expect(lighting.modeLayer.visible).toBe(true);
    pressPeek('keyup');
    expect(lighting.modeLayer.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });

  it('opens no door from a badge the players\' view hides', () => {
    const { store, wired } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true });
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 100)).toBe(false);
    expect(store.getState().objects.walls[door]?.closed).toBe(true);
    store.getState().setGMView(true);
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(store.getState().objects.walls[door]?.closed).toBe(false);
  });
});

describe('the lighting tool while its editor is hidden', () => {
  it('draws no wall and places no light', () => {
    const { store, eventBus, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    expect(click(100, 100)).toBe(false);
    expect(click(300, 100)).toBe(false);
    expect(store.getState().objects.walls).toEqual({});
    eventBus.emit('wall-submode-changed', 'place-light');
    expect(click(200, 200)).toBe(false);
    expect(store.getState().objects.lights).toEqual({});
  });

  it('drags no handle it does not show', () => {
    const { store, wired, click } = setup();
    const wall = addWall(store, 100, 300);
    const light = store.getState().addLight({ x: 500, y: 500, emission: emissionOfPreset('torch') });
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    expect(click(100, 100)).toBe(false);
    wired.pointerMove(150, 250, {} as FederatedPointerEvent);
    expect(wired.light.pointerDown(500, 500, { global: { x: 500, y: 500 } } as FederatedPointerEvent)).toBe(false);
    wired.pointerMove(600, 600, {} as FederatedPointerEvent);
    wired.pointerUp();
    expect(wired.light.cursorAt(500, 500)).toBeNull();
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
    expect(store.getState().objects.lights[light]).toMatchObject({ x: 500, y: 500 });
  });

  it('ends a drag that is under way and closes its undo step', () => {
    const { store, wired, click } = setup();
    const wall = addWall(store, 100, 300);
    store.getState().setActiveTool('wall');
    expect(click(100, 100)).toBe(true);
    wired.pointerMove(120, 140, {} as FederatedPointerEvent);
    store.getState().setGMView(false);
    wired.pointerMove(400, 400, {} as FederatedPointerEvent);
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 120, y: 140 });
    getHistoryStore(store).getState().undo();
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
  });

  it('keeps the walls of a chain being drawn and ends the chain', () => {
    const { store, click } = setup();
    store.getState().setActiveTool('wall');
    click(100, 100, { shift: true });
    click(300, 100, { shift: true });
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    pressPeek('keydown');
    pressPeek('keyup');
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    // The chain ended: the next click starts a new one instead of adding a segment.
    click(500, 300);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });

  it('offers no handle cursor, context menu, light settings or keyboard edits', () => {
    const { controller, store, wired } = setup();
    const wall = addWall(store, 100, 300);
    const light = store.getState().addLight({ x: 500, y: 500, emission: emissionOfPreset('torch') });
    store.getState().setActiveTool('wall');
    expect(wired.cursor(100, 100)).toBe('grab');
    wired.pointerDown(200, 100, { shiftKey: false, ctrlKey: false, metaKey: false } as FederatedPointerEvent);
    wired.pointerUp();
    store.getState().setGMView(false);
    expect(wired.cursor(100, 100)).toBe('default');
    wired.contextMenu(200, 100, 10, 10);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    wired.doubleClick();
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleDelete()).toBe(false);
    expect(controller.handleEscape()).toBe(false);
    expect(store.getState().objects.walls[wall]).toBeDefined();
    expect(store.getState().objects.lights[light]).toBeDefined();
  });

  it('works again in GM view', () => {
    const { store, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    store.getState().setGMView(true);
    click(100, 100);
    click(300, 100);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });
});

describe('tokens in session view', () => {
  const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };

  function scene(): Setup & { lurker: string } {
    const made = setup();
    const { store } = made;
    store.getState().setSceneLighting({ enabled: true });
    store.getState().addToken({ x: 100, y: 100, imagePath: 'h.png', vision: { enabled: true } });
    const lurker = store.getState().addToken({ x: 400, y: 100, imagePath: 'l.png' });
    lighting.sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]);
    return { ...made, lurker };
  }

  it('hides nothing by sight in GM view', () => {
    const { wired } = scene();
    expect(wired.playerSight()).toBeUndefined();
  });

  it('gives the lighting the sight rules of the map, read once and again when the collection\'s settings change', async () => {
    const { collectionSettingsChanged, obsApp } = scene();
    const { rules } = lighting.deps as SceneLightingDeps;
    const first = rules?.();
    expect(first).toMatchObject({ definitions: GENERIC_SIGHT_RULES.definitions, conditions: [] });
    expect(rules?.()).toBe(first);
    // Another collection's settings are none of this map's business.
    collectionSettingsChanged();
    await nextFrame();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    const collection = vi.spyOn(AssetService.getInstance(obsApp), 'getCollectionForMap').mockReturnValue('dungeon');
    collectionSettingsChanged();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(1);
    expect(rules?.()).not.toBe(first);
    collection.mockRestore();
  });

  it('works sight out anew once per frame, however many statblocks are announced, and no more after it is destroyed', async () => {
    const listeners = new Set<() => void>();
    const senses: TokenSensesResolver = {
      visionOf: () => ({ senses: [], source: 'none', blindBeyond: false, pending: false, key: '' }),
      sensesOf: () => [],
      subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    };
    const { controller } = setup({ senses });
    expect(listeners.size).toBe(1);
    const announce = (): void => listeners.forEach((listener) => listener());
    announce();
    announce();
    announce();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(1);
    announce();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);

    announce();
    controller.destroy();
    cleanup = null;
    expect(listeners.size).toBe(0);
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);
  });

  it('asks the resolver how each token perceives', () => {
    const visionOf = vi.fn(() => ({ senses: [{ id: 'blindsight', range: 10 }], source: 'statblock' as const, blindBeyond: false, pending: false, key: 'k' }));
    setup({ senses: { visionOf, sensesOf: () => [], subscribe: () => () => undefined } });
    const { rules } = lighting.deps as SceneLightingDeps;
    const token = { id: 't', kind: 'token' as const, imagePath: 't.png', x: 0, y: 0 };
    expect(rules?.().visionOf?.(token)).toMatchObject({ senses: [{ id: 'blindsight', range: 10 }] });
    expect(visionOf).toHaveBeenCalledWith(token);
  });

  it('reads the conditions of the token looked at', async () => {
    const { controller, store, lurker, obsApp, collectionSettingsChanged } = scene();
    store.getState().setGMView(false);
    store.getState().updateToken(lurker, { x: 150, conditions: ['dnd5e-invisible'] });
    expect(controller.playerSight()?.(lurker)).toBe('seen');
    const assets = AssetService.getInstance(obsApp);
    const settings = vi.spyOn(assets, 'getCollectionSettings').mockReturnValue({ conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#000000' }] });
    const collection = vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    collectionSettingsChanged();
    await nextFrame();
    expect(controller.playerSight()?.(lurker)).toBe('unseen');
    settings.mockRestore();
    collection.mockRestore();
  });

  it('hides nothing by sight while the scene has no lighting', () => {
    const { store, wired } = scene();
    store.getState().setSceneLighting({ enabled: false });
    store.getState().setGMView(false);
    expect(wired.playerSight()).toBeUndefined();
  });

  it('tells which tokens the players see, by the player frame\'s own predicate', () => {
    const { controller, store, wired, lurker } = scene();
    store.getState().setGMView(false);
    expect(wired.playerSight()?.(lurker)).toBe('unseen');
    expect(controller.playerSight()?.(lurker)).toBe('unseen');
  });

  it('leaves a dragged vision token out of the players\' frame where the sight that stayed behind does not reach', () => {
    const { controller, store } = scene();
    const hero = Object.keys(store.getState().objects.tokens)[0]!;
    holdTokens(store, [hero]);
    expect(controller.playerSight()?.(hero)).toBe('seen');
    store.getState().setTokenPositions([{ id: hero, x: 400, y: 100 }]);
    expect(controller.playerSight()?.(hero)).toBe('unseen');
    store.getState().setSceneLighting({ sightOnDrop: false });
    expect(controller.playerSight()?.(hero)).toBe('seen');
    store.getState().setSceneLighting({ sightOnDrop: true });
    holdTokens(store, []);
    expect(controller.playerSight()?.(hero)).toBe('seen');
  });

  it('follows a token that moves into sight', () => {
    const { store, wired, lurker } = scene();
    store.getState().setGMView(false);
    store.getState().updateToken(lurker, { x: 150, y: 100 });
    expect(wired.playerSight()?.(lurker)).toBe('seen');
  });

  it('shows and hides tokens again whenever sight changes or the view is switched', () => {
    const { store, wired } = scene();
    const { onSightChange } = lighting.deps as SceneLightingDeps;
    wired.refreshPlayerSight.mockClear();
    // In GM view sight hides no token, so its changes are not followed.
    onSightChange?.();
    expect(wired.refreshPlayerSight).not.toHaveBeenCalled();
    store.getState().setGMView(false);
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(1);
    onSightChange?.();
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(2);
    pressPeek('keydown');
    pressPeek('keyup');
    store.getState().setGMView(true);
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(5);
  });
});
