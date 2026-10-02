import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { bindHoldHotkey } from '../../keyboard/holdHotkey';
import { DEFAULT_MAP_HOTKEYS } from '../../keyboard/mapHotkeys';
import { AssetService } from '../../services/AssetService';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { heldForSight } from '../../lighting/sightOnDrop';
import { CreatureIndex } from '../../creatures/CreatureIndex';
import { tokenSensesResolver, type TokenSensesResolver } from '../../creatures/tokenSensesResolver';
import { mapSenseRulesSource } from '../../services/mapSenseRules';
import { SettingsService } from '../../services/SettingsService';
import type { ViewAtlasStore } from '../../storeFactory';
import { findAtlasLeafByViewId } from '../../utils/atlasLeafLookup';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { LayerVisibility } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import type { TokenRenderer } from '../TokenRenderer';
import { createSceneLighting } from './createSceneLighting';
import { GmSightAids } from './GmSightAids';
import { DoorIcons } from './DoorIcons';
import { showDoorMenu, showWallMenu, type LightingMenuContext } from './lightingMenus';
import { wireLightingPointer } from './lightingPointer';
import { LightInteraction } from './LightInteraction';
import { LightMarkers } from './LightMarkers';
import { LightRangeRings } from './LightRangeRings';
import { LightZoneEditor } from './LightZoneEditor';
import { closeStalePopovers } from './popoverGuards';
import { PerceptionMemo, playerLightingLayers, playerTokenSight, type GmOverlays, type TokenPerception } from './playerLightingLayers';
import type { SceneLightingView } from './sceneLightingView';
import { SessionLighting } from './SessionLighting';
import { SightRulesWatch } from './SightRulesWatch';
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
  /** How each token perceives; unset, by its own vision and its linked statblock (`tokenSensesResolver`). */
  senses?: TokenSensesResolver;
}

/**
 * Walls, lights and scene lighting for one map view: owns the lighting renderer, the wall editor
 * and the GM's overlays (door badges, light markers, the open light's range rings, the sight aids), and routes
 * the pointer to them. Walls follow the map's artwork, never the grid. In session view and while
 * the peek key is held, the canvas shows the players' lighting (`SessionLighting`): the GM's
 * overlays are hidden then, and take no input.
 */
export class LightingController {
  readonly renderer: SceneLightingView;
  /** What tells the GM how the rules of sight apply: sense ranges, marks on unseen tokens, the hover card's line. */
  readonly sightAids: GmSightAids;
  private readonly editor: WallEditor;
  private readonly zones: LightZoneEditor;
  private readonly doors: DoorIcons;
  private readonly lightMarkers: LightMarkers;
  private readonly rangeRings: LightRangeRings;
  private readonly lights: LightInteraction;
  private readonly session: SessionLighting;
  private readonly cleanups: Array<() => void> = [];
  private tokens: TokenRenderer | null = null;
  /** What the players perceive of each token, kept between frames while sight and light stay. */
  private readonly perceptions = new PerceptionMemo();
  private readonly sightListeners = new Set<() => void>();
  /** The sight rules of the map's collection; sight is worked out anew when they differ. */
  private readonly rules: SightRulesWatch;

  constructor(private readonly deps: LightingControllerDeps) {
    const { viewport, app, store, eventBus, obsApp } = deps;
    const assetService = AssetService.getInstance(obsApp);
    const measurement = (): MeasurementSettings => mapMeasurementSettings(assetService, store.getState());
    this.rules = new SightRulesWatch({
      obsApp,
      store,
      senses: deps.senses ?? tokenSensesResolver(CreatureIndex.forApp(obsApp), mapSenseRulesSource(obsApp, assetService, () => store.getState())),
      frames: () => this.frames(),
      // Rebuilds the scene from the store, as after a new map image.
      onChange: () => this.renderer.refreshBounds(),
    });
    this.renderer = createSceneLighting({
      viewport, app, store, obsApp, measurement, bounds: deps.bounds, albedo: deps.albedo,
      rules: () => this.sightRules(),
      onSightChange: () => this.onSightChange(),
    });
    this.sightAids = new GmSightAids({
      viewport, store, measurement, bounds: deps.bounds,
      rules: () => this.sightRules(),
      lighting: this.renderer,
      perception: () => this.playerSight(),
      frames: () => this.frames(),
    });
    this.lightMarkers = new LightMarkers(viewport, store);
    this.rangeRings = new LightRangeRings(viewport, store, measurement);
    this.editor = new WallEditor(viewport, store, eventBus, (lightIds) => this.lightMarkers.setSelected(lightIds), () => mapLightPresets(obsApp, store.getState()));
    this.zones = new LightZoneEditor({ viewport, canvas: app.canvas, store, eventBus, onActiveChange: () => this.session.sync() });
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
    this.cleanups.push(bindHoldHotkey(window, peekKey, deps.viewId, (held) => {
      // A light is not edited in the players' view: the peek closes its popover, as session view does.
      if (held) store.getState().closeLightPopover();
      this.session.setPeeking(held);
    }));
    // Subscribed after the overlays' own subscriptions, so the players' view is set last.
    this.cleanups.push(store.subscribe((state, previous) => {
      if (state.activeTool !== previous.activeTool || state.lighting.enabled !== previous.lighting.enabled) this.session.sync();
      closeStalePopovers(state);
    }));
    this.listen();
    this.session.sync();
  }

  /** Routes the pointer from the token renderer's dispatch: lights and door badges with any tool, walls with the lighting tool. */
  wire(tokens: TokenRenderer): void {
    this.tokens = tokens;
    tokens.setPlayerSightProvider(() => (this.session.active ? this.playerSight() : undefined));
    this.sightAids.wire(tokens);
    wireLightingPointer(tokens, {
      lights: this.lights, editor: this.editor, zones: this.zones, doors: this.doors,
      wallMenu: (x, y, screenX, screenY) => showWallMenu(this.menuContext(), x, y, screenX, screenY),
      doorMenu: (doorId, screenX, screenY) => showDoorMenu(this.deps.store, doorId, screenX, screenY),
    });
    // The token renderer brings the outlines of sensed tokens, which the view now shows or hides.
    this.session.sync();
  }

  gmOverlays(): GmOverlays {
    return {
      wallEditor: this.editor.layer, lightZones: this.zones.view, doorBadges: this.doors.view, lightMarkers: this.lightMarkers.view,
      rangeRings: this.rangeRings.view, sightAids: this.sightAids.view,
    };
  }

  /** What the players' view changes about the lighting: for their frame, and held in session view. */
  playerLayers(): LayerVisibility[] {
    return playerLightingLayers({
      enabled: this.renderer.isEnabled(),
      modeLayer: this.renderer.modeLayer,
      gmOverlays: this.gmOverlays(),
      sensedOutlines: this.tokens?.getSensedOutlineLayer(),
    });
  }

  /** How the players perceive each token, for their frame and for session view; sight hides nothing in an unlit scene. */
  playerSight(): TokenPerception | undefined {
    const state = this.deps.store.getState();
    return playerTokenSight(this.renderer, state.objects.tokens, { conditions: this.sightRules().conditions, held: heldForSight(state) }, this.perceptions);
  }

  /**
   * The same perception where the players' tokens decide what is seen: undefined on an unlit
   * scene and while nothing is hidden by line of sight (no token that sees, or token vision off).
   * For what shows tokens beside the map (the player window's initiative list).
   */
  tokenSight(): TokenPerception | undefined {
    return this.renderer.isEnabled() && !this.renderer.currentSight().all ? this.playerSight() : undefined;
  }

  /** Calls `listener` whenever the lighting view reports new sight; returns the unsubscribe. */
  onSightChanged(listener: () => void): () => void {
    this.sightListeners.add(listener);
    return () => this.sightListeners.delete(listener);
  }

  /** The senses and conditions of the map's collection, and how each token perceives. */
  private sightRules(): SightRules {
    return this.rules.current();
  }

  /** The window the canvas is in: a popout has its own frames. */
  private frames(): Window {
    return this.deps.app.canvas.ownerDocument?.defaultView ?? window;
  }

  /** Escape cancels a light or ring being dragged and closes the light popover; else it is the zone tool's or the wall editor's. */
  handleEscape(): boolean {
    const state = this.deps.store.getState();
    const dragging = this.lights.dragging;
    if (!dragging && !state.lightPopover) return this.zones.handleEscape() || this.editor.handleEscape();
    this.lights.cancel();
    state.closeLightPopover();
    return true;
  }

  handleDelete(): boolean {
    return this.zones.handleDelete() || this.editor.handleDelete();
  }

  /** Enter closes the light zone being drawn. */
  handleEnter(): boolean {
    return this.zones.handleEnter();
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
   * The layers the players' view changes, as the GM sees them. The light markers, the range
   * rings and the sight aids show by their own rules and follow `setSuppressed`.
   */
  private gmLayers(): LayerVisibility[] {
    const { activeTool, lighting } = this.deps.store.getState();
    const tool = activeTool === 'wall';
    const outlines = this.tokens?.getSensedOutlineLayer();
    return [
      { layer: this.renderer.modeLayer, visible: false },
      ...(outlines ? [{ layer: outlines, visible: false }] : []),
      { layer: this.editor.layer, visible: tool },
      { layer: this.zones.view, visible: tool && this.zones.active },
      { layer: this.doors.view, visible: tool || lighting.enabled },
    ];
  }

  private afterLayerSync(): void {
    const players = this.session.active;
    this.lightMarkers.setSuppressed(players);
    this.rangeRings.setSuppressed(players);
    this.sightAids.setSuppressed(players);
    if (players) this.lights.cancel();
    this.editor.afterVisibilityChange();
    this.zones.afterVisibilityChange();
    this.tokens?.refreshPlayerSight();
    requestRender(this.deps.app);
  }

  /** In the players' view, tokens show and hide as the sight they are checked against changes; in the GM's, the sight aids follow. */
  private onSightChange(): void {
    if (this.tokens && this.session.active) this.tokens.refreshPlayerSight();
    else this.sightAids.schedule();
    for (const listener of [...this.sightListeners]) listener();
  }

  private listen(): void {
    const { eventBus, store, obsApp, viewId } = this.deps;
    const on = (event: string, handler: () => void): void => {
      eventBus.on(event, handler);
      this.cleanups.push(() => eventBus.off(event, handler));
    };
    const stopEditing = (): void => {
      this.lights.cancel();
      this.zones.stop();
      store.getState().closeLightPopover();
      store.getState().closeLightZonePopover();
    };
    on('lighting-reset-explored', () => this.renderer.resetExplored());
    on('map-unloading', () => {
      this.editor.cancelDrawing();
      stopEditing();
      this.renderer.beforeMapUnload();
    });
    // Another Obsidian tab can come to the front by a key, without a press that would close the popover.
    const leafChange = obsApp.workspace.on('active-leaf-change', (leaf) => {
      if (leaf !== findAtlasLeafByViewId(obsApp.workspace, viewId)) stopEditing();
    });
    this.cleanups.push(() => obsApp.workspace.offref(leafChange));
    this.cleanups.push(() => this.rules.destroy());
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.sightListeners.clear();
    this.session.destroy();
    this.lights.destroy();
    this.editor.destroy();
    this.zones.destroy();
    this.renderer.destroy();
    this.doors.destroy();
    this.rangeRings.destroy();
    this.lightMarkers.destroy();
    this.sightAids.destroy();
  }
}
