/**
 * Where a numeral sits on its face, and how large.
 *
 * Numerals used to be sized per kind of die, as a share of the atlas cell, and
 * centred on the cell. That fits squares and pentagons, but a triangle has
 * little room towards its edges and a d10's kite even less, so wide numbers
 * ("14", an underlined "6") ran over the edge onto the chamfer. Here each
 * numeral is fitted to its own face: its ink is centred, slid along the face's
 * up axis to where the face is widest, and shrunk only as far as it has to be
 * to stay inside with a margin. It is never enlarged, so numerals that fitted
 * keep their size and place.
 */

/** Ink bounds of a numeral in its sheet cell, in sheet pixels, y down. */
export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NumeralPlacement {
  /** Factor on the numeral's nominal size; at most 1. */
  scale: number;
  /** How far the ink centre moves from the face centre towards the numeral's top, in cell pixels. */
  shift: number;
}

/** Share of the room a numeral may take: the rest keeps it off the worn rim. */
const MARGIN = 0.88;
/** How far a numeral may slide along its up axis, as a share of the face's reach. */
const MAX_SHIFT = 0.3;
const SHIFT_STEPS = 30;
const SCALE_STEP = 0.01;

/**
 * How many times the ink box, centred at `shift` above the face centre, fits
 * inside the face outline: 1 touches an edge, above 1 leaves room.
 */
function fitAt(outline: readonly (readonly [number, number])[], halfWidth: number, halfHeight: number, shift: number): number {
  let fit = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    let nx = b[1] - a[1];
    let ny = a[0] - b[0];
    const length = Math.hypot(nx, ny);
    nx /= length;
    ny /= length;
    let distance = nx * a[0] + ny * a[1];
    if (distance < 0) {
      nx = -nx;
      ny = -ny;
      distance = -distance;
    }
    // The corner of the box that reaches furthest towards this edge, measured from the face centre.
    const reach = Math.abs(nx) * halfWidth + Math.abs(ny) * halfHeight + ny * shift;
    if (reach > 0) fit = Math.min(fit, distance / reach);
  }
  return fit;
}

/**
 * Fits a numeral whose ink measures `inkWidth` by `inkHeight` cell pixels at
 * nominal size into the face `outline` (cell pixels around the face centre, y
 * towards the numeral's top): the largest size up to nominal that some
 * position holds within the margin, at the position closest to the centre.
 */
export function placeNumeral(
  outline: readonly (readonly [number, number])[],
  inkWidth: number,
  inkHeight: number,
): NumeralPlacement {
  const reach = Math.max(...outline.map(([x, y]) => Math.hypot(x, y)));
  for (let scale = 1; scale > SCALE_STEP; scale -= SCALE_STEP) {
    for (let i = 0; i <= SHIFT_STEPS; i++) {
      const offset = (i / SHIFT_STEPS) * MAX_SHIFT * reach;
      for (const shift of i === 0 ? [0] : [offset, -offset]) {
        if (fitAt(outline, (inkWidth * scale) / 2, (inkHeight * scale) / 2, shift) * MARGIN >= 1) return { scale, shift };
      }
    }
  }
  return { scale: SCALE_STEP, shift: 0 };
}
