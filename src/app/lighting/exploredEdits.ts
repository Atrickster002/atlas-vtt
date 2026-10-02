import { simplifyStroke } from '../pixi/lighting/wallEdits';
import type { StrokeShape } from '../tools/shapeStroke';
import type { Point } from '../types/visionTypes';
import { filledPieces } from './polygonFill';

/** What an edit does to the explored memory where it lands: marks it explored, or takes the memory away. */
export type ExploredEditMode = 'reveal' | 'forget';

/** An edit of the explored memory by hand: what a stroke covers, or the whole map. */
export interface ExploredEdit {
  mode: ExploredEditMode;
  area: StrokeShape | 'everything';
}

/** Corners of half a circle at a brush stroke's ends: a 24-gon is round at any brush size the memory resolves. */
const CAP_STEPS = 12;
/** Points of a brush stroke closer to the last than this share of the radius add nothing the memory resolves. */
const THINNING = 0.1;
/** How far, in map pixels, a lasso's outline may stray from the pointer's path: less than the memory resolves. */
const LASSO_TOLERANCE = 0.5;
/** The most corners a lasso keeps; its outline is checked corner against corner for crossings. */
const MAX_LASSO_CORNERS = 400;

/** A lasso's outline with the fewest corners that keep its shape, and no more than `MAX_LASSO_CORNERS`. */
function lassoOutline(points: readonly Point[]): Point[] {
  let tolerance = LASSO_TOLERANCE;
  let outline = simplifyStroke(points, tolerance);
  while (outline.length > MAX_LASSO_CORNERS) outline = simplifyStroke(points, tolerance *= 2);
  return outline;
}

/** The outline of everything within `radius` of the segment from `a` to `b`; a circle when they are one point. */
function capsule(a: Point, b: Point, radius: number): Point[] {
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  const outline: Point[] = [];
  for (const [centre, from] of [[b, along - Math.PI / 2], [a, along + Math.PI / 2]] as const) {
    for (let step = 0; step <= CAP_STEPS; step++) {
      const angle = from + (step / CAP_STEPS) * Math.PI;
      outline.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
    }
  }
  return outline;
}

/** A brush stroke's points without those that lie within `THINNING` of a radius of the one kept before; the last is always kept. */
function thinned(points: readonly Point[], radius: number): Point[] {
  const kept: Point[] = [];
  const least = (radius * THINNING) ** 2;
  points.forEach((point, index) => {
    const last = kept[kept.length - 1];
    if (!last || index === points.length - 1 || (point.x - last.x) ** 2 + (point.y - last.y) ** 2 >= least) kept.push(point);
  });
  return kept;
}

/**
 * The polygons a stroke covers, which together are its area: a rectangle, the pieces a lasso's
 * outline fills (it may cross itself: `filledPieces`), or one capsule for every stretch of a
 * brush stroke (they overlap).
 */
export function strokePolygons(shape: StrokeShape): Point[][] {
  if (shape.type === 'rectangle') {
    const { x, y, width, height } = shape;
    return [[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]];
  }
  if (shape.type === 'lasso') return shape.points.length >= 3 ? filledPieces(lassoOutline(shape.points)) : [];
  const points = thinned(shape.points, shape.brushRadius);
  if (points.length === 0 || !(shape.brushRadius > 0)) return [];
  if (points.length === 1) return [capsule(points[0]!, points[0]!, shape.brushRadius)];
  return points.slice(1).map((point, index) => capsule(points[index]!, point, shape.brushRadius));
}

/** The polygons an edit covers on a map of `bounds`. */
export function editPolygons({ area }: ExploredEdit, bounds: { width: number; height: number }): Point[][] {
  return area === 'everything' ? strokePolygons({ type: 'rectangle', x: 0, y: 0, width: bounds.width, height: bounds.height }) : strokePolygons(area);
}

/**
 * Coverage bytes as runs of equal values (count, value; a run longer than 255 goes on in the
 * next pair). The memory is flat but for its edges, so a snapshot of it shrinks to a small
 * share of its size.
 */
export function packCoverage(coverage: Uint8Array): Uint8Array {
  const runs: number[] = [];
  let at = 0;
  while (at < coverage.length) {
    const value = coverage[at]!;
    let length = 1;
    while (length < 255 && at + length < coverage.length && coverage[at + length] === value) length++;
    runs.push(length, value);
    at += length;
  }
  return Uint8Array.from(runs);
}

/** The coverage bytes `packCoverage` made runs of. */
export function unpackCoverage(packed: Uint8Array, length: number): Uint8Array {
  const coverage = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i + 1 < packed.length && at < length; i += 2) {
    const end = Math.min(length, at + packed[i]!);
    coverage.fill(packed[i + 1]!, at, end);
    at = end;
  }
  return coverage;
}

/** A rectangle of texels of the memory, and the coverage it holds, packed. */
export interface CoveragePatch<Region> {
  region: Region;
  packed: Uint8Array;
}

/** One edit of the memory as an undo step: the texels it changed, before and after. */
export interface ExploredStep<Region> {
  region: Region;
  before: Uint8Array;
  after: Uint8Array;
}

/**
 * The edits made to a scene's explored memory by hand, each kept as the texels it changed, so
 * undo and redo can put the memory back. Steps are numbered as the store counts them
 * (`exploredEdits`): step n leads from the memory after n − 1 edits to the memory after n. It
 * holds as many steps as the undo history holds (`limit`), so no step the history can reach is
 * missing here.
 */
export class ExploredEditStack<Region> {
  private readonly steps = new Map<number, ExploredStep<Region>>();

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.steps.size;
  }

  /** Records step `revision`; the steps after it were undone and are gone, as in the history. */
  record(revision: number, step: ExploredStep<Region>): void {
    for (const known of [...this.steps.keys()]) {
      if (known >= revision || known <= revision - this.limit) this.steps.delete(known);
    }
    this.steps.set(revision, step);
  }

  /**
   * What to write, in order, to take the memory from `from` edits to `to`: each undone step's
   * texels as they were before it, or each redone step's as they were after. A step that is not
   * kept is left out.
   */
  path(from: number, to: number): CoveragePatch<Region>[] {
    const patches: CoveragePatch<Region>[] = [];
    if (to < from) {
      for (let revision = from; revision > to; revision--) {
        const step = this.steps.get(revision);
        if (step) patches.push({ region: step.region, packed: step.before });
      }
    } else {
      for (let revision = from + 1; revision <= to; revision++) {
        const step = this.steps.get(revision);
        if (step) patches.push({ region: step.region, packed: step.after });
      }
    }
    return patches;
  }

  clear(): void {
    this.steps.clear();
  }
}
