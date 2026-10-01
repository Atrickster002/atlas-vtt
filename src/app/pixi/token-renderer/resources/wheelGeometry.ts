import type { ResourceValue } from '../../../resources/resourceTypes';

/** A whole maximum up to this many points is drawn as one segment per point. */
export const MAX_WHEEL_SEGMENTS = 8;
/** Gap between neighbouring segments, in radians. */
const SEGMENT_GAP = 0.12;
const TOP = -Math.PI / 2;
const TURN = Math.PI * 2;

/** One stroke of a wheel, in radians clockwise from the top. */
export interface WheelArc {
  start: number;
  end: number;
  lit: boolean;
}

/**
 * The arcs of a wheel showing `value`. `current` counts in the resource's own
 * direction, so the lit share is `current / max` for draining and filling alike.
 */
export function wheelArcs({ current, max }: ResourceValue): WheelArc[] {
  if (!(max > 0)) return [];
  if (Number.isInteger(max) && max > 1 && max <= MAX_WHEEL_SEGMENTS) {
    const step = TURN / max;
    return Array.from({ length: max }, (_, i) => ({
      start: TOP + i * step + SEGMENT_GAP / 2,
      end: TOP + (i + 1) * step - SEGMENT_GAP / 2,
      lit: i < current,
    }));
  }
  const share = Math.max(0, Math.min(1, current / max));
  const split = TOP + TURN * share;
  return [
    ...(share > 0 ? [{ start: TOP, end: split, lit: true }] : []),
    ...(share < 1 ? [{ start: split, end: TOP + TURN, lit: false }] : []),
  ];
}
