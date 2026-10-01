import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { worldToGameUnits } from '../../lighting/lightingUnits';
import { dragRange, type RangeField } from '../../lighting/lightRanges';
import type { ViewAtlasStore } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import type { LightMarkers } from './LightMarkers';
import type { LightRangeRings } from './LightRangeRings';

/** Screen pixels the pointer may move before a press on a marker is a drag, not a click. */
export const LIGHT_DRAG_THRESHOLD = 5;

/** What a press needs of the pointer event; PIXI reuses its event objects, so it is read at once. */
type Press = Pick<FederatedPointerEvent, 'global' | 'ctrlKey' | 'metaKey'>;

/** What the token renderer's viewport dispatch asks about placed lights, with any tool. */
export interface LightPointerHandlers {
  /** A left press at a world point; true when a marker or a ring handle took it. */
  pointerDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** The cursor over a marker or ring handle, null over neither. */
  cursorAt(worldX: number, worldY: number): string | null;
  /** The pointer left the canvas. */
  leave(): void;
}

export interface LightInteractionDeps {
  viewport: Viewport;
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  markers: LightMarkers;
  rings: LightRangeRings;
  /** The lighting tool is in use: a press selects the light, and a drag moves it. */
  canMove: () => boolean;
  /** Selects the light for the lighting tool; `add` toggles it in the selection. */
  select: (lightId: string, add: boolean) => void;
}

/**
 * The pointer on placed lights: a click on a marker opens the light's popover with any tool,
 * a drag moves the light with the lighting tool, and the handles of the open light's range
 * rings resize its ranges. A drag is one undo step, opened only once it starts. A press
 * anywhere else closes the popover.
 */
export class LightInteraction {
  /** Ends the press or drag under way. */
  private release: (() => void) | null = null;
  private readonly doc: Document;

  constructor(private readonly deps: LightInteractionDeps) {
    this.doc = deps.canvas.ownerDocument;
    this.doc.addEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  /**
   * A left press at a world point. True when a ring handle or a marker took it. With
   * `markersBlocked` (the lighting tool grabs a wall handle there, or draws past lights with
   * Shift), only the ring handles are asked.
   */
  pointerDown(point: Point, event: Press, markersBlocked = false): boolean {
    this.cancel();
    const handle = this.deps.rings.handleAt(point.x, point.y);
    if (handle) {
      this.dragRing(handle, point);
      return true;
    }
    const lightId = markersBlocked ? null : this.deps.markers.hitTest(point.x, point.y);
    if (!lightId) return false;
    this.pressMarker(lightId, event);
    return true;
  }

  /** The cursor over a ring handle or a marker, which it marks as hovered; null over neither. */
  cursorAt(point: Point, markersBlocked = false): string | null {
    const { markers, rings } = this.deps;
    const handle = rings.handleAt(point.x, point.y);
    const lightId = handle || markersBlocked ? null : markers.hitTest(point.x, point.y);
    rings.setHovered(handle);
    markers.setHovered(lightId);
    if (handle) return 'ns-resize';
    return lightId ? 'pointer' : null;
  }

  /** The pointer left the canvas. */
  clearHover(): void {
    this.deps.rings.setHovered(null);
    this.deps.markers.setHovered(null);
  }

  /** Ends a press or drag under way; a drag keeps what it changed, as its one undo step. */
  cancel(): void {
    this.release?.();
  }

  private pressMarker(lightId: string, event: Press): void {
    const { viewport, store, markers } = this.deps;
    const light = store.getState().objects.lights[lightId];
    if (!light) return;
    const start = { x: event.global.x, y: event.global.y };
    const grabbed = viewport.toWorld(start.x, start.y);
    const origin = { x: light.x, y: light.y };
    const add = event.ctrlKey || event.metaKey;
    const canMove = this.deps.canMove();
    if (canMove) this.deps.select(lightId, add);
    let dragging = false;
    let moved = false;

    const onMove = (move: FederatedPointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.global.x - start.x, move.global.y - start.y) <= LIGHT_DRAG_THRESHOLD) return;
        moved = true;
        if (!canMove) return;
        dragging = true;
        beginHistoryTransaction(store);
        markers.setDragging(lightId);
      }
      const at = viewport.toWorld(move.global.x, move.global.y);
      store.getState().updateLight(lightId, { x: origin.x + at.x - grabbed.x, y: origin.y + at.y - grabbed.y });
    };
    const onUp = (): void => {
      const clicked = !moved && !add;
      this.release?.();
      if (clicked) store.getState().openLightPopover(lightId);
    };
    this.track(onMove, onUp, () => {
      if (!dragging) return;
      markers.setDragging(null);
      endHistoryTransaction(store);
    });
  }

  private dragRing(field: RangeField, grabbedAt: Point): void {
    const { viewport, store, rings } = this.deps;
    const lightId = store.getState().lightPopover;
    const geometry = rings.geometry();
    if (!lightId || !geometry) return;
    // The handle keeps its distance to the pointer, so it does not jump when grabbed off-centre.
    const offset = Math.hypot(grabbedAt.x - geometry.center.x, grabbedAt.y - geometry.center.y) - geometry.radius[field];
    beginHistoryTransaction(store);
    rings.setDragging(field);

    const onMove = (move: FederatedPointerEvent): void => {
      const light = store.getState().objects.lights[lightId];
      if (!light) return;
      const at = viewport.toWorld(move.global.x, move.global.y);
      const radius = Math.max(0, Math.hypot(at.x - light.x, at.y - light.y) - offset);
      const emission = dragRange(light.emission, field, worldToGameUnits(radius, rings.unitScale()), move.altKey);
      if (emission !== light.emission) store.getState().updateLight(lightId, { emission });
    };
    this.track(onMove, () => this.release?.(), () => {
      rings.setDragging(null);
      endHistoryTransaction(store);
    });
  }

  /** Follows the pointer on the viewport until it is released; `finish` runs once, however the gesture ends. */
  private track(onMove: (event: FederatedPointerEvent) => void, onUp: () => void, finish: () => void): void {
    const { viewport } = this.deps;
    viewport.on('pointermove', onMove);
    viewport.on('pointerup', onUp);
    viewport.on('pointerupoutside', onUp);
    this.release = (): void => {
      this.release = null;
      viewport.off('pointermove', onMove);
      viewport.off('pointerup', onUp);
      viewport.off('pointerupoutside', onUp);
      finish();
    };
  }

  /**
   * A press outside the popover closes it, wherever it lands, except on a light's marker or a
   * ring handle on the map: those are the popover's own (the dispatch then moves the popover to
   * that light, or starts the drag).
   */
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const { store, canvas, viewport, markers, rings } = this.deps;
    if (!store.getState().lightPopover) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.atlas-light-popover')) return;
    if (target === canvas) {
      const rect = canvas.getBoundingClientRect();
      const point = viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      if (rings.handleAt(point.x, point.y) || markers.hitTest(point.x, point.y)) return;
    }
    store.getState().closeLightPopover();
  };

  destroy(): void {
    this.cancel();
    this.doc.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }
}
