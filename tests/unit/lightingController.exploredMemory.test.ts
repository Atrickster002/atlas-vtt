import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ExploredEdit } from '../../src/app/lighting/exploredEdits';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { SEES_ALL } from '../../src/app/vision/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { genericLight } from '../mocks/lights';

/** What the controller asked of the scene's memory. */
const memory = vi.hoisted(() => ({ edits: [] as unknown[], resets: 0, watcher: null as SceneLightingDeps['exploredWatcher'] | null }));

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
    memory.watcher = deps.exploredWatcher;
    return {
      modeLayer: { visible: false },
      isEnabled: () => deps.store.getState().lighting.enabled,
      currentSight: () => SEES_ALL,
      lightReaches: () => [],
      ambientLight: () => ({ ambient: 1 }),
      refreshBounds: vi.fn(),
      resetExplored: () => { memory.resets++; },
      editExplored: (edit) => {
        memory.edits.push(edit);
        return true;
      },
      beforeMapUnload: vi.fn(),
      renderForFrame: (_frame, render) => render(),
      destroy: vi.fn(),
    };
  },
}));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
const notices = vi.hoisted(() => [] as boolean[]);
vi.mock('../../src/app/pixi/lighting/lightingNotices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/pixi/lighting/lightingNotices')>()),
  showExploredTravelNotice: (undone: boolean) => { notices.push(undone); },
}));

type Press = (x: number, y: number, e: FederatedPointerEvent) => boolean;
type Move = (x: number, y: number, e: FederatedPointerEvent) => void;

interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  canvas: HTMLCanvasElement;
  down: (x: number, y: number) => boolean;
  move: (x: number, y: number) => void;
  up: () => void;
  light: LightPointerHandlers;
  cursor: (x: number, y: number) => string;
  /** The lighting tool, in its explored-memory mode, on a lit scene. */
  enterMode: () => void;
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  memory.edits = [];
  memory.resets = 0;
  notices.length = 0;
});

const KEYS = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false } as FederatedPointerEvent;
const PEEK = { key: 'h', code: 'KeyH', bubbles: true };

function setup(): Setup {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: createEl('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `lighting-memory-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/memory.atlasmap');
  const eventBus = new EventEmitter();
  const canvas = createEl('canvas');
  const controller = new LightingController({
    viewport,
    app: { canvas } as unknown as Application,
    store,
    eventBus,
    obsApp,
    viewId: 'memory-view',
    bounds: () => ({ width: 1000, height: 1000 }),
    albedo: () => null,
  });
  const wired: { down?: Press; move?: Move; up?: () => void; light?: LightPointerHandlers; cursor?: (x: number, y: number) => string } = {};
  controller.wire({
    setWallPointerDownHandler: (fn: Press) => { wired.down = fn; },
    setWallPointerMoveHandler: (fn: Move) => { wired.move = fn; },
    setWallPointerUpHandler: (fn: () => void) => { wired.up = fn; },
    setWallDoubleClickHandler: vi.fn(),
    setWallContextMenuHandler: vi.fn(),
    setWallCursorProvider: (fn: (x: number, y: number) => string) => { wired.cursor = fn; },
    setDoorMenuHandlers: vi.fn(),
    setDoorClickHandler: vi.fn(),
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setPlayerSightProvider: vi.fn(),
    refreshPlayerSight: vi.fn(),
    getSensedOutlineLayer: () => ({ visible: false }),
    setSightLineProvider: () => vi.fn(),
  } as unknown as TokenRenderer);
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  return {
    controller,
    store,
    eventBus,
    canvas,
    // As the token renderer dispatches a press of the lighting tool: lights first, then the tool.
    down: (x, y) => wired.light!.pointerDown(x, y, KEYS) || wired.down!(x, y, KEYS),
    move: (x, y) => wired.move!(x, y, KEYS),
    up: () => wired.up!(),
    light: wired.light!,
    cursor: (x, y) => wired.cursor!(x, y),
    enterMode: () => {
      store.getState().setSceneLighting({ enabled: true });
      store.getState().setActiveTool('wall');
      eventBus.emit('wall-submode-changed', 'explored-memory');
    },
  };
}

const overlay = (controller: LightingController): { visible: boolean } => controller.gmOverlays().exploredMemory;
const wallCount = (store: ViewAtlasStore): number => Object.keys(store.getState().objects.walls).length;

describe('the lighting tool\'s explored-memory mode', () => {
  it('shows what is explored only with the lighting tool in that mode, on a lit scene that remembers', () => {
    const { controller, store, eventBus } = setup();
    expect(overlay(controller).visible).toBe(false);
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'explored-memory');
    // Unlit: there is no memory to edit.
    expect(overlay(controller).visible).toBe(false);
    store.getState().setSceneLighting({ enabled: true });
    expect(overlay(controller).visible).toBe(true);

    store.getState().setSceneLighting({ exploredMemory: false });
    expect(overlay(controller).visible).toBe(false);
    store.getState().setSceneLighting({ exploredMemory: true });
    expect(overlay(controller).visible).toBe(true);

    eventBus.emit('wall-submode-changed', 'draw');
    expect(overlay(controller).visible).toBe(false);
    eventBus.emit('wall-submode-changed', 'explored-memory');
    store.getState().setActiveTool('select');
    expect(overlay(controller).visible).toBe(false);
  });

  it('never shows it to the players: not in session view, during a peek, in their frame or in a thumbnail', () => {
    const { controller, store, enterMode } = setup();
    enterMode();
    expect(overlay(controller).visible).toBe(true);

    expect(controller.playerLayers()).toContainEqual({ layer: overlay(controller), visible: false });
    const inThumbnail = captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, { x: 0, y: 0, resolution: 0.5 }, () => overlay(controller).visible);
    expect(inThumbnail).toBe(false);
    expect(overlay(controller).visible).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    expect(overlay(controller).visible).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(overlay(controller).visible).toBe(true);

    store.getState().setGMView(false);
    expect(overlay(controller).visible).toBe(false);
  });

  it('reveals what a brush stroke covers when it is released: one edit, and nothing before', () => {
    const { enterMode, down, move, up } = setup();
    enterMode();
    expect(down(100, 100)).toBe(true);
    move(160, 100);
    move(160, 180);
    expect(memory.edits).toEqual([]);
    up();
    expect(memory.edits).toEqual([{ mode: 'reveal', area: { type: 'brush', brushRadius: 50, points: [{ x: 100, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 180 }] } }]);
    // A release without a stroke does nothing.
    up();
    expect(memory.edits).toHaveLength(1);
  });

  it('forgets, and takes the shape and the brush size the menu chose', () => {
    const { enterMode, eventBus, down, move, up } = setup();
    enterMode();
    eventBus.emit('explored-edit-mode-changed', 'forget');
    eventBus.emit('explored-brush-size-changed', 20);
    down(100, 100);
    up();
    eventBus.emit('explored-shape-changed', 'rectangle');
    down(300, 400);
    move(200, 250);
    up();
    eventBus.emit('explored-edit-mode-changed', 'reveal');
    eventBus.emit('explored-shape-changed', 'lasso');
    down(10, 10);
    move(90, 10);
    move(50, 80);
    up();
    expect(memory.edits).toEqual<ExploredEdit[]>([
      { mode: 'forget', area: { type: 'brush', brushRadius: 20, points: [{ x: 100, y: 100 }] } },
      // A rectangle is not snapped to the grid: walls and rooms follow the map's artwork.
      { mode: 'forget', area: { type: 'rectangle', x: 200, y: 250, width: 100, height: 150 } },
      { mode: 'reveal', area: { type: 'lasso', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 80 }] } },
    ]);
  });

  it('applies nothing for a stroke that marks no area', () => {
    const { enterMode, eventBus, down, move, up } = setup();
    enterMode();
    eventBus.emit('explored-shape-changed', 'rectangle');
    down(300, 400);
    up();
    eventBus.emit('explored-shape-changed', 'lasso');
    down(10, 10);
    move(90, 10);
    up();
    expect(memory.edits).toEqual([]);
  });

  it('leaves nothing of a stroke that is cancelled: Escape, a lost pointer, the window losing focus, another tool or mode, the players\' view', () => {
    const cancels: [string, (s: Setup) => void][] = [
      ['Escape', ({ controller }) => expect(controller.handleEscape()).toBe(true)],
      ['pointercancel', ({ canvas }) => canvas.dispatchEvent(new Event('pointercancel'))],
      ['blur', () => window.dispatchEvent(new Event('blur'))],
      ['another tool', ({ store }) => store.getState().setActiveTool('select')],
      ['another mode', ({ eventBus }) => eventBus.emit('wall-submode-changed', 'draw')],
      ['session view', ({ store }) => store.getState().setGMView(false)],
      ['a peek', () => window.dispatchEvent(new KeyboardEvent('keydown', PEEK))],
      ['memory switched off', ({ store }) => store.getState().setSceneLighting({ exploredMemory: false })],
      ['lighting switched off', ({ store }) => store.getState().setSceneLighting({ enabled: false })],
      ['the scene unloading', ({ eventBus }) => eventBus.emit('map-unloading')],
    ];
    for (const [name, cancel] of cancels) {
      const s = setup();
      s.enterMode();
      s.down(100, 100);
      s.move(200, 100);
      cancel(s);
      s.up();
      expect(memory.edits, name).toEqual([]);
      window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
      cleanup?.();
      cleanup = null;
    }
  });

  it('takes no press while the canvas shows the players\' view', () => {
    const { store, enterMode, down, move, up } = setup();
    enterMode();
    store.getState().setGMView(false);
    expect(down(100, 100)).toBe(false);
    move(200, 100);
    up();
    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    expect(down(100, 100)).toBe(false);
    up();
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(memory.edits).toEqual([]);
  });

  it('takes every press of the tool: no wall is drawn and no light is opened or moved in the mode', () => {
    const { store, enterMode, down, move, up, light, cursor } = setup();
    const torch = store.getState().addLight({ x: 100, y: 100, emission: genericLight('torch') });
    enterMode();
    expect(light.pointerDown(100, 100, KEYS)).toBe(false);
    expect(light.cursorAt(100, 100)).toBeNull();
    expect(cursor(100, 100)).toBe('crosshair');
    down(100, 100);
    move(300, 300);
    up();
    down(400, 400);
    up();
    expect(wallCount(store)).toBe(0);
    expect(store.getState().lightPopover).toBeNull();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 100, y: 100 });
    expect(memory.edits).toHaveLength(2);
  });

  it('draws no wall either while the mode is chosen on a scene whose memory cannot be edited', () => {
    const { store, eventBus, down, up } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'explored-memory');
    for (const lighting of [{ enabled: false }, { enabled: true, exploredMemory: false }]) {
      store.getState().setSceneLighting(lighting);
      expect(down(100, 100)).toBe(false);
      up();
      down(300, 100);
      up();
    }
    expect(wallCount(store)).toBe(0);
    expect(memory.edits).toEqual([]);
  });

  it('marks all areas explored and forgets them from the menu\'s actions', () => {
    const { eventBus } = setup();
    eventBus.emit('lighting-reveal-explored');
    expect(memory.edits).toEqual([{ mode: 'reveal', area: 'everything' }]);
    eventBus.emit('lighting-reset-explored');
    expect(memory.resets).toBe(1);
  });

  it('leaves Escape to the wall editor when no stroke is under way', () => {
    const { controller, enterMode } = setup();
    enterMode();
    expect(controller.handleEscape()).toBe(false);
  });

  it('tells the GM of an undo or redo of a memory edit unless the canvas shows the memory', () => {
    const { store, enterMode } = setup();
    // The engine's memory reports to the mode's overlay.
    memory.watcher!.memoryTravelled(true);
    expect(notices).toEqual([true]);
    enterMode();
    memory.watcher!.memoryTravelled(true);
    memory.watcher!.memoryTravelled(false);
    expect(notices).toEqual([true]);
    store.getState().setGMView(false);
    memory.watcher!.memoryTravelled(false);
    expect(notices).toEqual([true, false]);
  });
});
