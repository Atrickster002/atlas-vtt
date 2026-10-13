/**
 * One drag of a Table's row or column by its handle, as Obsidian's table
 * editor drags them: the handle follows the pointer along the table, a line
 * shows where the row or column lands, and letting go moves it. Our own press
 * handling (threshold, pointer capture, Escape, the window's blur,
 * `pointercancel`), all on the handle's own document and window, so a popout
 * works the same; `finish` takes every listener and style away again.
 */

import { DRAG_THRESHOLD } from '../dnd/ListDrag';

export type TableAxis = 'row' | 'column';

/** How far the held handle has followed the pointer along the table; the stylesheet moves it by this. */
const DRAG_SHIFT = '--atlas-sb-sheet-table-drag-shift';

/** Where the drop line stands, in the table frame's coordinates. */
export interface DropLine {
  axis: TableAxis;
  /** Its distance from the frame's top (a row) or left edge (a column). */
  offset: number;
  /** How long it is: the table's width (a row) or height (a column). */
  length: number;
}

export interface TableDragHost {
  axis: TableAxis;
  /** The row or column held. */
  from: number;
  /** The table frame the boxes and the line are measured against. */
  frame: HTMLElement;
  /** The boxes of the rows or columns, in order. */
  boxes: () => DOMRect[];
  /** The press became a drag. */
  onStart: () => void;
  /** Where the line stands, or null where letting go moves nothing. */
  onLine: (line: DropLine | null) => void;
  /** Let go over another place: the row or column goes there. */
  onDrop: (to: number) => void;
  /** Escape, a lost pointer, the window's blur, or letting go where it was. */
  onCancel: (started: boolean) => void;
}

interface Span {
  start: number;
  end: number;
}

export class TableDrag {
  private active = false;
  private ended = false;
  private spans: Span[] = [];
  private target: number | null = null;
  private origin: number;
  private length = 0;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly pointerId: number;
  private readonly startedAt: { x: number; y: number };

  constructor(private readonly host: TableDragHost, private readonly handle: HTMLElement, event: PointerEvent) {
    this.doc = handle.doc;
    this.win = handle.win;
    this.pointerId = event.pointerId;
    this.startedAt = { x: event.clientX, y: event.clientY };
    this.origin = this.along(event);
    this.doc.addEventListener('pointermove', this.onMove, true);
    this.doc.addEventListener('pointerup', this.onUp, true);
    this.doc.addEventListener('pointercancel', this.onLost, true);
    this.doc.addEventListener('keydown', this.onKey, true);
    this.win.addEventListener('blur', this.onLost);
  }

  /** Stops the drag as a cancel (the table went away). */
  cancel(): void {
    this.finish(false);
  }

  private along(event: { clientX: number; clientY: number }): number {
    return this.host.axis === 'row' ? event.clientY : event.clientX;
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    if (!this.active) {
      if (Math.hypot(event.clientX - this.startedAt.x, event.clientY - this.startedAt.y) < DRAG_THRESHOLD) return;
      this.activate();
    }
    event.preventDefault();
    this.update(this.along(event));
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.finish(true);
  };

  private readonly onLost = (): void => this.finish(false);

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.finish(false);
  };

  private activate(): void {
    const frame = this.host.frame.getBoundingClientRect();
    const row = this.host.axis === 'row';
    const base = row ? frame.top : frame.left;
    this.spans = this.host.boxes().map((box) => (row ? { start: box.top - base, end: box.bottom - base } : { start: box.left - base, end: box.right - base }));
    const table = this.host.frame.querySelector('table')?.getBoundingClientRect() ?? frame;
    this.length = row ? table.width : table.height;
    this.origin -= base;
    this.active = true;
    try {
      this.handle.setPointerCapture(this.pointerId);
    } catch {
      // A pointer the browser no longer knows: the document's listeners still follow it.
    }
    this.host.onStart();
  }

  private update(client: number): void {
    const frame = this.host.frame.getBoundingClientRect();
    const at = client - (this.host.axis === 'row' ? frame.top : frame.left);
    const first = this.spans[0];
    const last = this.spans.at(-1);
    if (!first || !last) return;
    // The handle follows the pointer, held within the table.
    const held = this.spans[this.host.from];
    const shift = held ? Math.min(Math.max(at - this.origin, first.start - held.start), last.end - held.end) : 0;
    this.handle.style.setProperty(DRAG_SHIFT, `${shift}px`);
    const point = Math.min(Math.max(at, first.start), last.end - 0.5);
    const index = this.spans.findIndex((span) => point >= span.start && point < span.end);
    this.target = index < 0 || index === this.host.from ? null : index;
    const span = this.target === null ? undefined : this.spans[this.target];
    this.host.onLine(span && this.target !== null
      ? { axis: this.host.axis, offset: this.target < this.host.from ? span.start : span.end, length: this.length }
      : null);
  }

  private finish(drop: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.doc.removeEventListener('pointermove', this.onMove, true);
    this.doc.removeEventListener('pointerup', this.onUp, true);
    this.doc.removeEventListener('pointercancel', this.onLost, true);
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.win.removeEventListener('blur', this.onLost);
    this.handle.style.removeProperty(DRAG_SHIFT);
    this.host.onLine(null);
    if (this.active) {
      try {
        this.handle.releasePointerCapture(this.pointerId);
      } catch {
        // Already released with the pointer.
      }
    }
    if (drop && this.active && this.target !== null) this.host.onDrop(this.target);
    else this.host.onCancel(this.active);
  }
}
