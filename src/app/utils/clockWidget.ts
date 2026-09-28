export const DEFAULT_CLOCK_COLOR = '#e5484d';

/** Segment counts offered for new clocks: 4 for complex, 6 for complicated, 8 and up for daunting obstacles. */
export const CLOCK_SEGMENT_OPTIONS = [3, 4, 6, 8, 10, 12] as const;
export const DEFAULT_CLOCK_SEGMENTS = 4;
const MIN_CLOCK_SEGMENTS = 2;
const MAX_CLOCK_SEGMENTS = 12;

/** Side of the square viewBox clock faces are drawn in. */
export const CLOCK_VIEW_SIZE = 32;
const CENTRE = CLOCK_VIEW_SIZE / 2;
const OUTER_RADIUS = CENTRE - 1;
/** A clock showing its count becomes a ring, and the count sits in the hole. */
const RING_INNER_RADIUS = 11;
/** Widest share of the hole the count may take, and the size it grows to when it is short. */
const COUNT_WIDTH = RING_INNER_RADIUS * 1.7;
const MAX_COUNT_FONT_SIZE = 10;
/** Approximate advance of a bold tabular digit or slash, in ems. */
const GLYPH_WIDTH_EM = 0.62;

export interface ClockFace {
  /** SVG path data per wedge, from twelve o'clock clockwise like the printed clocks. */
  wedges: string[];
  /** The "3/6" count in the centre, sized in viewBox units to fit the hole. */
  count: { text: string; fontSize: number } | null;
}

export function isValidClockSegments(segments: unknown): segments is number {
  return Number.isInteger(segments) && (segments as number) >= MIN_CLOCK_SEGMENTS && (segments as number) <= MAX_CLOCK_SEGMENTS;
}

/** The wedges and optional centred count of a clock in a `CLOCK_VIEW_SIZE` square. */
export function clockFace(segments: number, value: number, showCount: boolean): ClockFace {
  if (!showCount) return { wedges: clockWedgePaths(segments, 0), count: null };
  const text = `${value}/${segments}`;
  const fontSize = Math.min(MAX_COUNT_FONT_SIZE, COUNT_WIDTH / (text.length * GLYPH_WIDTH_EM));
  return { wedges: clockWedgePaths(segments, RING_INNER_RADIUS), count: { text, fontSize: round(fontSize) } };
}

/** Pie wedges when `innerRadius` is 0, ring sectors otherwise. */
function clockWedgePaths(segments: number, innerRadius: number): string[] {
  const point = (index: number, radius: number): string => {
    const angle = (index / segments) * 2 * Math.PI;
    return `${round(CENTRE + radius * Math.sin(angle))} ${round(CENTRE - radius * Math.cos(angle))}`;
  };
  const outerArc = (index: number): string =>
    `${point(index, OUTER_RADIUS)} A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${point(index + 1, OUTER_RADIUS)}`;

  return Array.from({ length: segments }, (_, index) => innerRadius === 0
    ? `M ${CENTRE} ${CENTRE} L ${outerArc(index)} Z`
    : `M ${outerArc(index)} L ${point(index + 1, innerRadius)} A ${innerRadius} ${innerRadius} 0 0 0 ${point(index, innerRadius)} Z`);
}

/** Value after clicking wedge `index`: fills up to it, or empties it when it is the last filled one. */
export function clockValueForWedge(index: number, value: number): number {
  return index + 1 === value ? index : index + 1;
}

export function clockProgressLabel(label: string, value: number, segments: number): string {
  return `${label}: ${value} of ${segments}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
