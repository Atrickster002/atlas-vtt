import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { bindHoldHotkey } from '../../keyboard/holdHotkey';
import { DEFAULT_MAP_HOTKEYS } from '../../keyboard/mapHotkeys';
import { AssetService } from '../../services/AssetService';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { SettingsService } from '../../services/SettingsService';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MapBounds } from '../../vision/visibility';
import type { LayerVisibility } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import type { TokenRenderer } from '../TokenRenderer';
import { createSceneLighting } from './createSceneLighting';
import { DoorIcons } from './DoorIcons';
import { showWallMenu, type LightingMenuContext } from './lightingMenus';
import { LightInteraction } from './LightInteraction';
import { LightMarkers, lightMarkersShown } from './LightMarkers';
import { LightRangeRings } from './LightRangeRings';
import { playerLightingLayers, playerTokenSight, type GmOverlays } from './playerLightingLayers';
import type { SceneLightingView } from './sceneLightingView';
import { SessionLighting } from './SessionLighting';
import { WallEditor } from './WallEditor';

export interface LightingControllerDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
  bounds: () => MapBounds | null;
  /** The map image, for the colours light bounces off. */
  albedo: () => Texture | null;
}

/**
 * Walls, lights and scene lighting for one map view: owns the lighting renderer, the wall editor
 * and the GM's overlays (door badges, light markers, the open light's range rings), and routes
 * the pointer to them. Walls follow the map's artwork, never the grid. In session view and while
 * the peek key is held, the canvas shows the players' lighting (`SessionLighting`): the GM's
 * overlays are hidden then, and take no input.
 */
export class LightingController {
  readonly renderer: SceneLightingView;
  private readonly editor: WallEditor;
  private readonly doors: DoorIcons;
  private readonly lightMarkers: LightMarkers;
  private readonly rangeRings: LightRangeRings;
  private readonly lights: LightInteraction;
  private readonly session: SessionLighting;
  private readonly cleanups: Array<() => void> = [];
  private tokens: TokenRenderer | null = null;

  constructor(private readonly deps: LightingControllerDeps) {
    const { viewport, app, store, eventBus, obsApp } = deps;
    const assetService = AssetService.getInstance(obsApp);
    const measurement = (): MeasurementSettings => mapMeasurementSettings(assetService, store.getState());
    this.renderer = createSceneLighting({
      viewport, app, store, obsApp, measurement, bounds: deps.bounds, albedo: deps.albedo,
      onSightChange: () => this.onSightChange(),
    });
    this.lightMarkers = new LightMarkers(viewport, store);
    this.rangeRings = new LightRangeRings(viewport, store, measurement);
    this.editor = new WallEditor(viewport, store, eventBus, (lightIds) => this.lightMarkers.setSelected(lightIds));
    this.doors = new DoorIcons(store);
    viewport.addChild(this.doors.view);
    this.lights = new LightInteraction({
      viewport,
      canvas: app.canvas,
      store,
      markers: this.lightMarkers,
      rings: this.rangeRings,
      canMove: () => this.editor.shown,
      select: (lightId, add) => this.editor.walls.selectLight(lightId, add),
    });
    this.session = new SessionLighting({
      store,
      playerLayers: () => this.playerLayers(),
      gmLayers: () => this.gmLayers(),
      onChange: () => this.afterLayerSync(),
    });
    const peekKey = (): string => (SettingsService.forApp(obsApp)?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS).lightingPeek;
    this.cleanups.push(bindHoldHotkey(window, peekKey, deps.viewId, (held) => this.session.setPeeking(held)));
    // Subscribed after the overlays' own subscriptions, so the players' view is set last.
    this.cleanups.push(store.subscribe((state, previous) => {
      if (state.activeTool !== previous.activeTool || state.lighting.enabled !== previous.lighting.enabled) this.session.sync();
      if (state.lightPopover && !mayEditLight(state, state.lightPopover)) state.closeLightPopover();
    }));
    this.listen();
    this.session.sync();
  }

  /** Routes the pointer from the token renderer's dispatch: lights and door badges with any tool, walls with the lighting tool. */
  wire(tokens: TokenRenderer): void {
    this.tokens = tokens;
    tokens.setPlayerSightProvider(() => (this.session.active ? this.playerSight() : undefined));
    tokens.setLightHandlers({
      // With the lighting tool, a wall handle is grabbed before the marker beneath it, and Shift draws past lights.
      pointerDown: (x, y, e) => this.lights.pointerDown({ x, y }, e, this.editor.handleAt({ x, y }) || (this.editor.shown && e.shiftKey && !e.ctrlKey && !e.metaKey)),
      cursorAt: (x, y) => this.lights.cursorAt({ x, y }, this.editor.handleAt({ x, y })),
      leave: () => this.lights.clearHover(),
    });
    tokens.setWallPointerDownHandler((x, y, e) => this.editor.pointerDown({ x, y }, e.shiftKey, e.ctrlKey || e.metaKey));
    tokens.setWallPointerMoveHandler((x, y) => this.editor.pointerMove({ x, y }));
    tokens.setWallPointerUpHandler(() => this.editor.pointerUp());
    tokens.setWallDoubleClickHandler(() => this.editor.doubleClick());
    tokens.setWallContextMenuHandler((x, y, screenX, screenY) => {
      if (this.editor.shown) showWallMenu(this.menuContext(), x, y, screenX, screenY);
    });
    tokens.setWallCursorProvider((x, y) => this.editor.cursorAt({ x, y }));
    tokens.setDoorClickHandler((x, y) => {
      const doorId = this.doors.hitTest(x, y);
      if (doorId) this.doors.toggle(doorId);
      return !!doorId;
    });
  }

  gmOverlays(): GmOverlays {
    return { wallEditor: this.editor.layer, doorBadges: this.doors.view, lightMarkers: this.lightMarkers.view, rangeRings: this.rangeRings.view };
  }

  /** What the players' view changes about the lighting: for their frame, and held in session view. */
  playerLayers(): LayerVisibility[] {
    return playerLightingLayers({ enabled: this.renderer.isEnabled(), modeLayer: this.renderer.modeLayer, gmOverlays: this.gmOverlays() });
  }

  /** Which tokens the players see, for their frame and for session view; sight hides nothing in an unlit scene. */
  playerSight(): ((tokenId: string) => boolean) | undefined {
    return playerTokenSight(this.renderer, this.deps.store.getState().objects.tokens);
  }

  /** Escape closes the light popover, else it is the wall editor's. */
  handleEscape(): boolean {
    const state = this.deps.store.getState();
    if (!state.lightPopover) return this.editor.handleEscape();
    state.closeLightPopover();
    return true;
  }

  handleDelete(): boolean {
    return this.editor.handleDelete();
  }

  private menuContext(): LightingMenuContext {
    return {
      store: this.deps.store,
      walls: this.editor.walls,
      wallRenderer: this.editor.renderer,
      lightAt: (x, y) => this.lightMarkers.hitTest(x, y),
    };
  }

  /**
   * The layers the players' view changes, as the GM sees them. The light markers and the range
   * rings show by their own rules and follow `setSuppressed`.
   */
  private gmLayers(): LayerVisibility[] {
    const { activeTool, lighting } = this.deps.store.getState();
    const tool = activeTool === 'wall';
    return [
      { layer: this.renderer.modeLayer, visible: false },
      { layer: this.editor.layer, visible: tool },
      { layer: this.doors.view, visible: tool || lighting.enabled },
    ];
  }

  private afterLayerSync(): void {
    const players = this.session.active;
    this.lightMarkers.setSuppressed(players);
    this.rangeRings.setSuppressed(players);
    if (players) this.lights.cancel();
    this.editor.afterVisibilityChange();
    this.tokens?.refreshPlayerSight();
    requestRender(this.deps.app);
  }

  /** In the players' view, tokens show and hide as the sight they are checked against changes. */
  private onSightChange(): void {
    if (this.tokens && this.session.active) this.tokens.refreshPlayerSight();
  }

  private listen(): void {
    const { eventBus, store } = this.deps;
    const on = (event: string, handler: () => void): void => {
      eventBus.on(event, handler);
      this.cleanups.push(() => eventBus.off(event, handler));
    };
    on('lighting-reset-explored', () => this.renderer.resetExplored());
    on('map-unloading', () => {
      this.editor.cancelDrawing();
      this.lights.cancel();
      store.getState().closeLightPopover();
      this.renderer.beforeMapUnload();
    });
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.session.destroy();
    this.lights.destroy();
    this.editor.destroy();
    this.renderer.destroy();
    this.doors.destroy();
    this.rangeRings.destroy();
    this.lightMarkers.destroy();
  }
}

/** A light's popover needs the light, its marker on the map and the GM's view of a loaded scene. */
function mayEditLight(state: ViewAtlasState, lightId: string): boolean {
  return !!state.objects.lights[lightId] && state.isGMView && !state.isMapLoading && lightMarkersShown(state);
}
