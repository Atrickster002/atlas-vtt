import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { gameUnitsToWorld, unitScaleOf, type UnitScale } from '../../lighting/lightingUnits';
import { RANGE_FIELDS, type RangeField } from '../../lighting/lightRanges';
import type { ViewAtlasStore } from '../../storeFactory';
import type { LightSource } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import { PANEL_ENTER_MS, prefersReducedMotion } from '../../utils/motion';
import { canvasBadgeColors } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { lightColorNumber } from './lightMarker';

/** Above the light markers (95), below token UI (100). */
export const RANGE_RINGS_Z_INDEX = 96;
/** Screen pixels. */
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS = 11;
const LINE_WIDTH = 1.5;
const UNDER_WIDTH = 3.5;
const DASH = 7;
const DASH_GAP = 6;
const MAX_DASHES = 240;
const HANDLE_LIFT = 1.25;

/** Where a ring's handle sits: the bright ring's above the light, the dim ring's below, so they never meet. */
const HANDLE_DIRECTION: Record<RangeField, number> = { bright: -1, dim: 1 };

export interface RingGeometry {
  center: Point;
  /** World radius of each ring. */
  radius: Record<RangeField, number>;
}

/** The world point of a ring's handle. */
export function ringHandlePoint(geometry: RingGeometry, field: RangeField): Point {
  return { x: geometry.center.x, y: geometry.center.y + HANDLE_DIRECTION[field] * geometry.radius[field] };
}

/** The ring whose handle is at the world `point` at viewport `zoom`; the nearer one where both are in reach. */
export function ringHandleAt(geometry: RingGeometry, point: Point, zoom: number): RangeField | null {
  let nearest: RangeField | null = null;
  let best = HANDLE_HIT_RADIUS / zoom;
  for (const field of RANGE_FIELDS) {
    // A range of nothing has no ring and no handle: it would sit on the marker and take its presses.
    if (geometry.radius[field] <= 0) continue;
    const handle = ringHandlePoint(geometry, field);
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance <= best) {
      best = distance;
      nearest = field;
    }
  }
  return nearest;
}

/**
 * The bright and dim range of the light whose popover is open, as rings on the map: the bright
 * ring a solid line, the dim ring dashed, in the light's colour over a dark hairline so they
 * read on any map, each with a handle to drag. Lines and handles keep their size on screen.
 * They bloom out of the marker when the popover opens and fade back when it closes. A GM overlay
 * (`GmOverlays`): never in the players' view.
 */
export class LightRangeRings {
  readonly view = new Container({ label: 'light-range-rings', zIndex: RANGE_RINGS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly lines = this.view.addChild(new Graphics());
  private readonly handles: Record<RangeField, Graphics> = {
    bright: this.view.addChild(new Graphics()),
    dim: this.view.addChild(new Graphics()),
  };
  /** 0 hidden, 1 fully shown. */
  private readonly reveal = new ValueTransition(0, PANEL_ENTER_MS, () => this.draw());
  /** The light the rings are drawn for; it stays while they fade out. */
  private lightId: string | null = null;
  private suppressed = false;
  private hovered: RangeField | null = null;
  private dragging: RangeField | null = null;
  private readonly unsubscribe: () => void;
  private readonly redraw = (): void => this.draw();

  constructor(
    private readonly viewport: Viewport,
    private readonly store: ViewAtlasStore,
    private readonly measurement: () => MeasurementSettings,
  ) {
    this.view.visible = false;
    viewport.addChild(this.view);
    viewport.on('zoomed', this.redraw);
    viewport.on('zoomed-end', this.redraw);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.lightPopover !== previous.lightPopover) this.follow(state.lightPopover);
      else if (state.objects.lights !== previous.objects.lights || state.grid !== previous.grid) this.draw();
    });
    this.follow(store.getState().lightPopover);
  }

  /** Hides the rings at once while the canvas shows the players' view. */
  setSuppressed(on: boolean): void {
    if (this.suppressed === on) return;
    this.suppressed = on;
    this.draw();
  }

  setHovered(field: RangeField | null): void {
    if (this.hovered === field) return;
    this.hovered = field;
    this.draw();
  }

  setDragging(field: RangeField | null): void {
    if (this.dragging === field) return;
    this.dragging = field;
    this.draw();
  }

  /** How many game units a cell spans and how wide it is, for converting a drag. */
  unitScale(): UnitScale {
    return unitScaleOf(this.measurement(), this.store.getState().grid);
  }

  /** The rings of the open light, or null while none show. */
  geometry(): RingGeometry | null {
    const light = this.shownLight();
    if (!light || this.suppressed || this.store.getState().lightPopover !== light.id) return null;
    const scale = this.unitScale();
    return {
      center: { x: light.x, y: light.y },
      radius: { bright: gameUnitsToWorld(light.emission.bright, scale), dim: gameUnitsToWorld(light.emission.dim, scale) },
    };
  }

  /** The ring whose handle is at the world point, while the rings show. */
  handleAt(x: number, y: number): RangeField | null {
    const geometry = this.geometry();
    return geometry ? ringHandleAt(geometry, { x, y }, this.viewport.scale.x) : null;
  }

  private shownLight(): LightSource | null {
    return this.lightId ? this.store.getState().objects.lights[this.lightId] ?? null : null;
  }

  /** The popover opened, moved to another light or closed. */
  private follow(lightId: string | null): void {
    const reduce = prefersReducedMotion(document.body);
    if (lightId) {
      // Rings of another light bloom anew from its marker.
      if (lightId !== this.lightId) this.reveal.jumpTo(0);
      this.lightId = lightId;
      if (reduce) this.reveal.jumpTo(1);
      else this.reveal.animateTo(1);
      return;
    }
    this.hovered = null;
    this.dragging = null;
    const forget = (): void => {
      this.lightId = null;
      this.draw();
    };
    if (reduce || this.reveal.value === 0) {
      this.reveal.jumpTo(0);
      forget();
    } else {
      this.reveal.animateTo(0, forget);
    }
  }

  private draw(): void {
    const light = this.shownLight();
    const reveal = this.reveal.value;
    const shown = !!light && !this.suppressed && reveal > 0;
    this.view.visible = shown;
    this.lines.clear();
    if (!light || !shown) return;

    const zoom = this.viewport.scale.x;
    const pixel = 1 / zoom;
    const scale = this.unitScale();
    const color = lightColorNumber(light.emission.color);
    // The rings grow the last tenth of their radius as they fade in.
    const grow = 0.9 + 0.1 * reveal;
    this.view.alpha = reveal;
    const g = this.lines;
    for (const field of RANGE_FIELDS) {
      const radius = gameUnitsToWorld(light.emission[field], scale) * grow;
      const handle = this.handles[field];
      handle.visible = radius > 0;
      if (radius <= 0) continue;
      for (const [width, lineColor, alpha] of [[UNDER_WIDTH, 0x000000, 0.45], [LINE_WIDTH, color, 1]] as const) {
        if (field === 'bright') g.circle(light.x, light.y, radius);
        else this.dashes(light, radius, zoom);
        g.stroke({ width: width * pixel, color: lineColor, alpha });
      }
      this.drawHandle(field, handle, color);
      handle.position.set(light.x, light.y + HANDLE_DIRECTION[field] * radius);
      handle.scale.set(pixel * (this.hovered === field || this.dragging === field ? HANDLE_LIFT : 1));
    }
  }

  /** The dim ring: dashes of a constant length on screen, as many as fit. */
  private dashes(light: LightSource, radius: number, zoom: number): void {
    const circumference = 2 * Math.PI * radius * zoom;
    const count = Math.min(MAX_DASHES, Math.max(8, Math.round(circumference / (DASH + DASH_GAP))));
    const step = (2 * Math.PI) / count;
    const dash = step * (DASH / (DASH + DASH_GAP));
    for (let i = 0; i < count; i++) {
      // Centred on the handle's axis, so a dash, not a gap, sits under the handle.
      const start = Math.PI / 2 + i * step - dash / 2;
      this.lines.moveTo(light.x + Math.cos(start) * radius, light.y + Math.sin(start) * radius);
      this.lines.arc(light.x, light.y, radius, start, start + dash);
    }
  }

  private drawHandle(field: RangeField, handle: Graphics, color: number): void {
    const held = this.dragging === field;
    handle.clear();
    handle.circle(0, 0, HANDLE_RADIUS + 1).stroke({ width: 1, color: 0x000000, alpha: 0.45 });
    handle.circle(0, 0, HANDLE_RADIUS).fill({ color: held ? color : canvasBadgeColors().background });
    handle.circle(0, 0, HANDLE_RADIUS - 1).stroke({ width: 2, color });
  }

  destroy(): void {
    this.unsubscribe();
    this.reveal.cancel();
    this.viewport.off('zoomed', this.redraw);
    this.viewport.off('zoomed-end', this.redraw);
    destroyTree(this.view);
  }
}
