import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { useViewStoreHook } from '../../react/ViewStoreContext';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import { observeResize } from '../../utils/observeResize';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { LIGHT_MARKER_RADIUS } from './lightMarker';
import { placeLightPopover, type PopoverSide } from './lightPopoverPlacement';

/** Between the marker's edge and the popover. */
const GAP = 12;

/**
 * Keeps the popover in `ref` beside its light on the map (`placeLightPopover`). It is placed
 * with `translate` on the map's own frame clock, so it follows pan, zoom and a dragged light in
 * the frame the canvas shows them, and its `transform-origin` is the light, which it grows out
 * of. When `lightId` changes, the same popover travels to the other light.
 */
export function useLightPopoverPosition(ref: React.RefObject<HTMLElement | null>, lightId: string): void {
  const store = useViewStoreHook();
  const { renderer, pixiApp } = useAtlasUI();
  const target = useRef(lightId);
  const place = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.offsetParent;
    const viewport = renderer?.getViewportInstance();
    const canvas = renderer?.getCanvasElement();
    if (!element || !container || !viewport || !canvas) return undefined;

    const measure = (): { x: number; y: number; area: { width: number; height: number }; size: { width: number; height: number } } => {
      const area = container.getBoundingClientRect();
      const map = canvas.getBoundingClientRect();
      return {
        x: map.left - area.left,
        y: map.top - area.top,
        area: { width: area.width, height: area.height },
        size: { width: element.offsetWidth, height: element.offsetHeight },
      };
    };
    let frame = measure();
    let side: PopoverSide | null = null;
    let placedFor = '';

    const update = (): void => {
      // A light that is gone keeps the popover where it was while it leaves.
      const light = store.getState().objects.lights[target.current];
      if (!light) return;
      const zoom = viewport.scale.x;
      const at = viewport.toScreen(light.x, light.y);
      const key = `${at.x},${at.y},${zoom}`;
      if (key === placedFor) return;
      placedFor = key;
      const placement = placeLightPopover({
        anchor: { x: frame.x + at.x, y: frame.y + at.y },
        clearance: LIGHT_MARKER_RADIUS * mapMarkerScale(zoom) * zoom + GAP,
        size: frame.size,
        area: frame.area,
        side,
      });
      side = placement.side;
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
    const ticker = pixiApp?.ticker;
    ticker?.add(update);
    const stopObserving = observeResize([element, container], remeasure);
    return () => {
      ticker?.remove(update);
      stopObserving();
      place.current = null;
    };
  }, [ref, renderer, pixiApp, store]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (target.current === lightId || !element) return;
    const from = element.style.translate;
    target.current = lightId;
    place.current?.();
    const to = element.style.translate;
    if (!from || from === to || prefersReducedMotion(element)) return;
    element.animate([{ translate: from }, { translate: to }], { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT });
  }, [lightId, ref]);
}
