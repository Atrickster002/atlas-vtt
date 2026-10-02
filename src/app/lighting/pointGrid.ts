import type { Point } from '../types/visionTypes';

interface Cell<T> {
  cx: number;
  cy: number;
  items: T[];
  /** Where each item lies, beside the items, so a search reads numbers only until it finds one. */
  xs: number[];
  ys: number[];
}

/** Points binned in square cells at least `tolerance` wide, so neighbours are one cell away. */
export class PointGrid<T> {
  private readonly cells = new Map<number, Cell<T>>();
  /** Every cell that holds an item, for walking the cells instead of a segment. */
  private readonly occupied: Cell<T>[] = [];

  constructor(private readonly size: number) {}

  add(p: Point, item: T): void {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size);
    const key = this.key(cx, cy);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { cx, cy, items: [], xs: [], ys: [] };
      this.cells.set(key, cell);
      this.occupied.push(cell);
    }
    cell.items.push(item);
    cell.xs.push(p.x);
    cell.ys.push(p.y);
  }

  /** Visits the items within `radius` of `p`, a cell width at most, with where each lies from it and how far. */
  eachWithin(p: Point, radius: number, visit: (item: T, dx: number, dy: number, distance: number) => void): void {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size);
    const radius2 = radius * radius;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cell = this.cells.get(this.key(cx + i, cy + j));
        if (!cell) continue;
        const { items, xs, ys } = cell;
        for (let n = 0; n < items.length; n++) {
          const dx = xs[n]! - p.x, dy = ys[n]! - p.y;
          const distance2 = dx * dx + dy * dy;
          if (distance2 <= radius2) visit(items[n]!, dx, dy, Math.sqrt(distance2));
        }
      }
    }
  }

  /**
   * Visits the items beside a segment: within `reach` of the line through it, and farther than
   * that from both of its ends. Samples a cell width apart, each with the cells around its own,
   * cover every point within 0.86 cells of the segment.
   */
  besideSegment(a: Point, b: Point, reach: number, visit: (item: T) => void): void {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const reach2 = reach * reach;
    const lineReach2 = reach2 * length2 * (1 + 1e-9);
    // Most of what the cells hold is not beside the segment: told from numbers alone, before anything is visited.
    const visitCell = ({ items, xs, ys }: Cell<T>): void => {
      for (let n = 0; n < items.length; n++) {
        const ax = xs[n]! - a.x, ay = ys[n]! - a.y;
        const cross = ax * dy - ay * dx;
        if (cross * cross > lineReach2 || ax * ax + ay * ay <= reach2) continue;
        const bx = xs[n]! - b.x, by = ys[n]! - b.y;
        if (bx * bx + by * by > reach2) visit(items[n]!);
      }
    };
    const steps = Math.max(1, Math.ceil(Math.sqrt(length2) / this.size));
    // A segment far longer than the map (a damaged or foreign file) would be sampled without end
    if (steps > this.occupied.length) {
      this.cellsNear(a, b, visitCell);
      return;
    }
    let lastX = NaN, lastY = NaN;
    for (let s = 0; s <= steps; s++) {
      const cx = Math.floor((a.x + (dx * s) / steps) / this.size), cy = Math.floor((a.y + (dy * s) / steps) / this.size);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cy - 1; j <= cy + 1; j++) {
          // The sample before this one is a cell away at most on each axis, and so is every sample
          // before that from it: a cell that was looked at then is one of those around the last.
          if (Math.abs(i - lastX) <= 1 && Math.abs(j - lastY) <= 1) continue;
          const cell = this.cells.get(this.key(i, j));
          if (cell) visitCell(cell);
        }
      }
      lastX = cx;
      lastY = cy;
    }
  }

  /**
   * Visits the cells the samples of `besideSegment` would reach, by walking the cells that hold
   * items instead of the segment: a sample reaches the cells around its own, whose centres lie
   * within one and a half cells of it on each axis.
   */
  private cellsNear(a: Point, b: Point, visit: (cell: Cell<T>) => void): void {
    const reach = this.size * 1.5 * Math.SQRT2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    for (const cell of this.occupied) {
      const x = (cell.cx + 0.5) * this.size, y = (cell.cy + 0.5) * this.size;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
      if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) > reach) continue;
      visit(cell);
    }
  }

  private key(cx: number, cy: number): number {
    // Colliding keys only add candidates; every caller checks the distance.
    return cx * 73_856_093 + cy;
  }
}
