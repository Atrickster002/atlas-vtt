import type { PreviewWindowLayout } from '../stores/pinnedNotePreviewSlice';

interface Size {
  width: number;
  height: number;
}

/** Distance of a preview opened at the pointer from the pointer and from the area's edges. */
const POINTER_GAP = 12;
const EDGE_GAP = 10;

/**
 * Where a preview window currently sits and how large it is, or null while it
 * is hidden: a hidden window measures 0 × 0 at 0, 0.
 */
function readPreviewWindowLayout(element: HTMLElement): PreviewWindowLayout | null {
  if (element.offsetWidth === 0 || element.offsetHeight === 0) return null;
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/**
 * The layout as shown within bounds: unchanged when it fits, otherwise shrunk
 * and moved just enough to stay in reach. Unknown bounds (a hidden map view)
 * leave it as it is.
 */
export function fitPreviewWindowLayout(layout: PreviewWindowLayout, bounds: Size): PreviewWindowLayout {
  if (bounds.width === 0 || bounds.height === 0) return layout;
  const width = Math.min(layout.width, bounds.width);
  const height = Math.min(layout.height, bounds.height);
  return {
    left: clamp(layout.left, 0, bounds.width - width),
    top: clamp(layout.top, 0, bounds.height - height),
    width,
    height,
  };
}

/**
 * Where a preview of the given size opens next to the pointer, in the
 * coordinates of the area it is positioned in: beside and below the pointer,
 * flipped to the other side where it would run past the area's edge.
 */
export function previewPositionNearPointer(
  pointer: { x: number; y: number },
  size: Size,
  area: Size,
): { left: number; top: number } {
  const nearAxis = (at: number, extent: number, room: number): number => {
    const after = at + POINTER_GAP;
    const start = after + extent > room - EDGE_GAP ? at - extent - POINTER_GAP : after;
    return Math.max(EDGE_GAP, start);
  };
  return {
    left: nearAxis(pointer.x, size.width, area.width),
    top: nearAxis(pointer.y, size.height, area.height),
  };
}

/**
 * Keeps a preview window at the place and size the user gave it. That layout
 * is what the map saves; the window shows it fitted to the element it is
 * positioned in (the map's leaf), so a smaller screen shrinks or moves it only
 * while the screen is too small, and never changes what is saved.
 */
export class PreviewWindowPlacement {
  private layout: PreviewWindowLayout | null = null;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly element: HTMLElement,
    private readonly boundsEl: HTMLElement,
  ) {
    this.observer = new ResizeObserver(() => this.show());
    this.observer.observe(boundsEl);
  }

  /** The place and size the user chose, or null before they chose one. */
  getLayout(): PreviewWindowLayout | null {
    return this.layout;
  }

  /** Shows a saved layout. */
  restore(layout: PreviewWindowLayout): void {
    this.layout = layout;
    this.show();
  }

  /** Takes the window's current place and size, after a pin or a resize. */
  recordCurrent(): void {
    this.layout = readPreviewWindowLayout(this.element) ?? this.layout;
  }

  /** Takes the place a drag moved the window to; its size stays, even while it is shown smaller. */
  recordMove(): void {
    const current = readPreviewWindowLayout(this.element);
    if (!current) return;
    this.layout = this.layout ? { ...this.layout, left: current.left, top: current.top } : current;
  }

  /**
   * Opens the window next to the pointer, given in window coordinates. The
   * window is positioned in the map's leaf, not in the window: the leaf has
   * `contain: strict`, which makes it the box of its fixed descendants, and it
   * starts wherever Obsidian's sidebars and tab headers end.
   */
  placeNearPointer(clientX: number, clientY: number): void {
    const area = this.boundsEl.getBoundingClientRect();
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight };
    const { left, top } = previewPositionNearPointer({ x: clientX - area.left, y: clientY - area.top }, size, area);
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  /** The window follows the pointer again, so no layout of the user's applies. */
  clear(): void {
    this.layout = null;
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private show(): void {
    if (!this.layout) return;
    const bounds = { width: this.boundsEl.clientWidth, height: this.boundsEl.clientHeight };
    const { left, top, width, height } = fitPreviewWindowLayout(this.layout, bounds);
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
