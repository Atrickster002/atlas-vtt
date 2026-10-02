import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { beamOf } from '../../lighting/lightBeam';
import { gameUnitsToWorld, unitScaleOf } from '../../lighting/lightingUnits';
import { useViewStoreHook } from '../../react/ViewStoreContext';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import { observeResize } from '../../utils/observeResize';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { LIGHT_MARKER_RADIUS } from './lightMarker';
import { placeLightPopover, type PopoverChoice } from './lightPopoverPlacement';
import { ringHandlePoints } from './lightRingGeometry';
import type { VisionCone } from '../../vision/visionCone';

/** Between the marker's edge, or the bright ring, and the popover. */
const GAP = 12;
/** The bars of the map view the popover keeps clear of: scene tabs above, the toolbars below. */
const TOP_BARS = '.atlas-scene-tab-bar';
const BOTTOM_BARS = '.atlas-bottom-toolbar-row .atlas-vtt-toolbar';

interface Frame {
  /** The canvas within the area the popover is placed in. */
  x: number;
  y: number;
  area: { width: number; height: number };
  inset: { top: number; bottom: number };
  size: { width: number; height: number };
}

/**
 * Keeps the popover in `ref` at its light on the map (`placeLightPopover`): beyond the bright
 * ring where there is room, clear of the ring handles and of the map view's bars. It is placed
 * with `translate` on the map's own frame clock, so it follows pan, zoom and a dragged light in
 * the frame the canvas shows them, and its `transform-origin` is the light, which it grows out
 * of. The ring and the beam it keeps clear of are those it found when it took its place: tuning
 * or turning the light does not move the popover under the pointer. When `lightId` changes, the same popover travels
 * to the other light. `unitDistance` is the game units a grid cell spans.
 */
export function useLightPopoverPosition(ref: React.RefObject<HTMLElement | null>, lightId: string, unitDistance: number): void {
  const store = useViewStoreHook();
  const { renderer, pixiApp } = useAtlasUI();
  const target = useRef(lightId);
  const units = useRef(unitDistance);
  units.current = unitDistance;
  /** Places the popover; with `anew`, on the best side for the light as it is now. */
  const place = useRef<((anew?: boolean) => void) | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.offsetParent;
    const viewport = renderer?.getViewportInstance();
    const canvas = renderer?.getCanvasElement();
    if (!element || !container || !viewport || !canvas) return undefined;
    const bars = [...container.querySelectorAll(`${TOP_BARS}, ${BOTTOM_BARS}`)];

    const measure = (): Frame => {
      const area = container.getBoundingClientRect();
      const map = canvas.getBoundingClientRect();
      const edges = (selector: string): DOMRect[] => [...container.querySelectorAll(selector)].map((bar) => bar.getBoundingClientRect()).filter((rect) => rect.height > 0);
      return {
        x: map.left - area.left,
        y: map.top - area.top,
        area: { width: area.width, height: area.height },
        inset: {
          top: Math.max(0, ...edges(TOP_BARS).map((rect) => rect.bottom - area.top)),
          bottom: Math.max(0, ...edges(BOTTOM_BARS).map((rect) => area.bottom - rect.top)),
        },
        size: { width: element.offsetWidth, height: element.offsetHeight },
      };
    };
    let frame = measure();
    let choice: PopoverChoice | null = null;
    /** World radius of the bright ring the popover keeps clear of. */
    let ring = 0;
    /** The beam whose handles it keeps clear of. */
    let beam: VisionCone | undefined;
    let placedFor = '';

    const update = (anew = false): void => {
      // A light that is gone keeps the popover where it was while it leaves.
      const state = store.getState();
      const light = state.objects.lights[target.current];
      if (!light) return;
      const zoom = viewport.scale.x;
      const at = viewport.toScreen(light.x, light.y);
      const key = `${at.x},${at.y},${zoom},${light.emission.bright},${light.emission.dim}`;
      if (key === placedFor && !anew) return;
      placedFor = key;
      const scale = unitScaleOf({ unitDistance: units.current }, state.grid);
      const bright = gameUnitsToWorld(light.emission.bright, scale);
      const dim = gameUnitsToWorld(light.emission.dim, scale);
      if (anew || !choice) {
        choice = null;
        ring = bright;
        beam = beamOf(light);
      }
      const anchor = { x: frame.x + at.x, y: frame.y + at.y };
      const handlesOf = (cone: VisionCone | undefined): { x: number; y: number }[] =>
        ringHandlePoints({ center: anchor, radius: { bright: bright * zoom, dim: dim * zoom }, ...(cone && { cone }) }, 1);
      const input = {
        anchor,
        markerClearance: LIGHT_MARKER_RADIUS * mapMarkerScale(zoom) * zoom + GAP,
        bright: bright * zoom,
        size: frame.size,
        area: frame.area,
        inset: frame.inset,
      };
      let placement = placeLightPopover({ ...input, handles: handlesOf(beam), ringClearance: ring * zoom + GAP, current: choice });
      if (choice && !placement.kept) {
        // Its place no longer holds: it moves to the best one for the ring and the beam as they are now.
        ring = bright;
        beam = beamOf(light);
        placement = placeLightPopover({ ...input, handles: handlesOf(beam), ringClearance: ring * zoom + GAP, current: null });
      }
      choice = placement.choice;
      element.style.translate = `${placement.x}px ${placement.y}px`;
      element.style.transformOrigin = `${placement.origin.x}px ${placement.origin.y}px`;
    };
    const remeasure = (): void => {
      frame = measure();
      placedFor = '';
      update();
    };

    update();
    place.current = update;
    const tick = (): void => update();
    const ticker = pixiApp?.ticker;
    ticker?.add(tick);
    const stopObserving = observeResize([element, container, ...bars], remeasure);
    return () => {
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts.
      if (ticker && pixiApp?.ticker === ticker) ticker.remove(tick);
      stopObserving();
      place.current = null;
    };
  }, [ref, renderer, pixiApp, store]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (target.current === lightId || !element) return;
    const from = element.style.translate;
    target.current = lightId;
    place.current?.(true);
    const to = element.style.translate;
    if (!from || from === to || prefersReducedMotion(element)) return;
    element.animate([{ translate: from }, { translate: to }], { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT });
  }, [lightId, ref]);
}
