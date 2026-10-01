import type { Point } from '../../types/visionTypes';

export type PopoverSide = 'left' | 'right';

export interface LightPopoverPlacementInput {
  /** The light, in the pixels of the area the popover is placed in. */
  anchor: Point;
  /** From the light to the popover's near edge: the marker's radius and a gap. */
  clearance: number;
  size: { width: number; height: number };
  area: { width: number; height: number };
  /** The side the popover is on; it stays there while it fits. */
  side: PopoverSide | null;
  margin?: number;
}

export interface LightPopoverPlacement {
  x: number;
  y: number;
  side: PopoverSide;
  /** The light, relative to the popover's box: its transform origin. */
  origin: Point;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(Math.max(min, max), value));

/**
 * Where the popover of a light goes: beside the marker, level with it, on the side with more
 * room. It keeps its side while it fits there, so it does not flip back and forth as the map
 * pans, and stays inside the area: pushed along its edges when the light is near or past them.
 */
export function placeLightPopover({ anchor, clearance, size, area, side, margin = 8 }: LightPopoverPlacementInput): LightPopoverPlacement {
  const fits: Record<PopoverSide, boolean> = {
    right: anchor.x + clearance + size.width <= area.width - margin,
    left: anchor.x - clearance - size.width >= margin,
  };
  const roomier: PopoverSide = area.width - anchor.x >= anchor.x ? 'right' : 'left';
  const other: PopoverSide = roomier === 'right' ? 'left' : 'right';
  const chosen = side && fits[side] ? side : fits[roomier] || !fits[other] ? roomier : other;
  const beside = chosen === 'right' ? anchor.x + clearance : anchor.x - clearance - size.width;
  const x = Math.round(clamp(beside, margin, area.width - margin - size.width));
  const y = Math.round(clamp(anchor.y - size.height / 2, margin, area.height - margin - size.height));
  return { x, y, side: chosen, origin: { x: anchor.x - x, y: anchor.y - y } };
}
