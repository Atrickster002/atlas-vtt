import { bristleOffset, drawingBox, hasBristle, paintGeometry, paintMask, paintStroke } from './paint/paintShapes';
import { installPaintFilters, removePaintFilters } from './paint/paintFilters';
import { PAINT_SELECTOR, ROLE_VARIANT, paintRoleOf } from './paintRules';

/** The attribute the skin's stylesheet draws by; its value is the kind of paint. */
export const PAINT_ATTRIBUTE = 'data-atlas-paint';
/** Set while the edge is kept inside the element's box, since the box clips. */
const CLIPPED_ATTRIBUTE = 'data-atlas-paint-clipped';
const PROPERTIES = ['--atlas-paint-mask', '--atlas-paint-line', '--atlas-paint-inset', '--atlas-paint-bristle-at'] as const;
/** Smaller than this an element shows no edge worth drawing. */
const MIN_SIDE = 10;

interface Painted {
  seed: number;
  /** Kind, fit and the size on the raster: what was last drawn. */
  drawn: string;
}

/**
 * Hands every element the paper skin paints its silhouette. The stylesheet draws the paint with
 * the element's pseudo-elements; this only says which shape: the mask, the ink line and how far
 * they reach past the box, as custom properties. No node is added, so React-built and DOM-built
 * panels are served alike, and nothing is left behind when the skin goes.
 */
export class PaintRuntime {
  private readonly painted = new WeakMap<Element, Painted>();
  private readonly pending = new Set<Element>();
  private readonly view: NonNullable<Document['defaultView']>;
  private readonly sizes: ResizeObserver;
  private readonly changes: MutationObserver;
  private frame: number | null = null;
  private nextSeed = 1;

  constructor(private readonly doc: Document) {
    this.view = doc.defaultView ?? window;
    this.sizes = new this.view.ResizeObserver((entries) => {
      for (const entry of entries) this.paint(entry.target);
    });
    this.changes = new this.view.MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') this.queue(record.target);
        else record.addedNodes.forEach((node) => this.queue(node));
      }
    });
  }

  start(): void {
    installPaintFilters(this.doc);
    this.changes.observe(this.doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-pressed', 'aria-selected', 'data-state'],
    });
    this.scan(this.doc.body);
  }

  /** Takes the paint off every element again. */
  stop(): void {
    removePaintFilters(this.doc);
    this.changes.disconnect();
    this.sizes.disconnect();
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pending.clear();
    this.doc.querySelectorAll<HTMLElement>(`[${PAINT_ATTRIBUTE}]`).forEach((element) => this.clear(element));
  }

  private queue(node: Node): void {
    if (node.nodeType !== 1) return;
    this.pending.add(node as Element);
    if (this.frame !== null) return;
    this.frame = this.view.requestAnimationFrame(() => {
      this.frame = null;
      const batch = [...this.pending];
      this.pending.clear();
      for (const element of batch) if (element.isConnected) this.scan(element);
    });
  }

  private scan(root: Element): void {
    if (root.matches(PAINT_SELECTOR) || root.hasAttribute(PAINT_ATTRIBUTE)) this.paint(root);
    root.querySelectorAll(PAINT_SELECTOR).forEach((element) => this.paint(element));
  }

  private paint(element: Element): void {
    if (!isStyled(element)) return;
    const role = paintRoleOf(element);
    if (!role) {
      if (this.painted.has(element)) this.clear(element);
      return;
    }
    const box = element.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) return;
    let state = this.painted.get(element);
    if (!state) {
      state = { seed: this.nextSeed++, drawn: '' };
      this.painted.set(element, state);
      element.setAttribute(PAINT_ATTRIBUTE, role);
      this.sizes.observe(element);
    }
    // Read after the attribute is set: the stylesheet opens the overflow of the panels it can.
    const clipped = clips(element);
    const variant = ROLE_VARIANT[role];
    const drawing = drawingBox(box.width, box.height);
    const drawn = `${role}:${clipped}:${drawing.width}x${drawing.height}`;
    if (drawn === state.drawn) return;
    state.drawn = drawn;
    if (element.getAttribute(PAINT_ATTRIBUTE) !== role) element.setAttribute(PAINT_ATTRIBUTE, role);
    element.style.setProperty('--atlas-paint-mask', paintMask(variant, state.seed, box.width, box.height));
    element.style.setProperty('--atlas-paint-line', paintStroke(variant, state.seed, box.width, box.height));
    // An element that clips would cut a silhouette that reaches past its box, so there the
    // paint layer is the box itself and the shape lies a little inside it.
    element.style.setProperty('--atlas-paint-inset', clipped ? '0' : paintGeometry(variant, state.seed, box.width, box.height).inset);
    if (hasBristle(variant)) element.style.setProperty('--atlas-paint-bristle-at', bristleOffset(state.seed * 7919));
    element.toggleAttribute(CLIPPED_ATTRIBUTE, clipped);
  }

  private clear(element: Element): void {
    this.painted.delete(element);
    this.sizes.unobserve(element);
    element.removeAttribute(PAINT_ATTRIBUTE);
    element.removeAttribute(CLIPPED_ATTRIBUTE);
    if (isStyled(element)) for (const property of PROPERTIES) element.style.removeProperty(property);
  }
}

function isStyled(element: Element): element is HTMLElement | SVGElement {
  return 'style' in element;
}

/** Whether the element clips or scrolls what reaches past its box. */
function clips(element: Element): boolean {
  const style = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
  const cuts = (overflow: string): boolean => overflow !== '' && overflow !== 'visible';
  return cuts(style.overflowX) || cuts(style.overflowY);
}
