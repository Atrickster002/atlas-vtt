import { MOTION_EASE_OUT, MOTION_FAST_MS, MOTION_NORMAL_MS, MOTION_SLOW_MS, prefersReducedMotion } from '../../../utils/motion';

/**
 * The control's morph: the button itself grows into the menu or panel, and shrinks back into the
 * button. The control stands at the row's bottom left, so its real width and height grow up and to
 * the right with that corner fixed (never a scale, which would stretch the corners, border and text,
 * and never a move). Content lies in layers at their final width, held at the bottom left of the
 * clipped content box, so text never reflows or moves on the way. A new motion starts from wherever
 * the running one is, so nothing jumps.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Content fades in this long after it starts to grow, and fades out before it shrinks. */
const CONTENT_IN_MS = 160;
const CONTENT_IN_DELAY_MS = 90;
/** Under reduced motion sizes snap, and content only fades. */
const REDUCED_FADE_MS = 120;

const sizeOf = (el: HTMLElement): Size => {
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
};

const sameSize = (a: Size, b: Size): boolean => Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** A size as the control's content box: `border` is its border's width. */
const frameOf = (size: Size, border: number): { width: string; height: string } => ({ width: `${size.width - 2 * border}px`, height: `${size.height - 2 * border}px` });

function fade(el: HTMLElement, to: 0 | 1, duration: number, delay = 0): Animation {
  const from = Number(el.win.getComputedStyle(el).opacity);
  el.setCssProps({ opacity: String(to) });
  return el.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: MOTION_EASE_OUT, fill: 'backwards' });
}

export interface MorphHost {
  /** The control: the one element that is the button, the menu and the panel. */
  readonly root: HTMLElement;
  /** The clipped box inside it that holds the content layers. */
  readonly content: HTMLElement;
  /** What the collapsed control shows; it fades out as the control opens. */
  readonly collapsed: readonly HTMLElement[];
  /** The collapsed control's size. */
  closedSize(): Size;
  /** The tallest the control may grow. */
  maxHeight(): number;
}

export class ControlMorph {
  private readonly host: MorphHost;
  private layer: HTMLElement | null = null;
  private closing = false;
  private width = 0;
  private sizing: Animation | null = null;
  /** Where the control is going (or stands) while open. */
  private goal: Size | null = null;
  /** Counts motions, so the end of an interrupted close changes nothing. */
  private generation = 0;
  private readonly resizes: ResizeObserver;

  constructor(host: MorphHost) {
    this.host = host;
    // The next frame: fitting sets the content's room, which an observer must not change in its own callback.
    this.resizes = new ResizeObserver(() => host.root.win.requestAnimationFrame(() => this.fit(MOTION_NORMAL_MS)));
  }

  /** The content layer of the open control, or null while it is closed or closing. */
  get current(): HTMLElement | null {
    return this.closing ? null : this.layer;
  }

  /** Opens the control on `layer`, `width` wide; an open or closing control changes to it. */
  open(layer: HTMLElement, width: number): void {
    this.generation++;
    const { root, content } = this.host;
    const reduce = prefersReducedMotion(root);
    const previous = this.layer;
    const opening = previous === null || this.closing;
    this.closing = false;
    root.addClass('is-open');
    this.width = width;
    content.appendChild(layer);
    layer.addClass('atlas-online-layer');
    layer.setCssProps({ width: `${width - 2 * this.border()}px` });
    this.layer = layer;
    this.resizes.disconnect();
    this.resizes.observe(layer);
    if (previous !== null && previous !== layer) leave(previous, reduce);
    // The button's accent dissolves into the content as it fades in: one surface turning into the other.
    if (opening) for (const part of this.host.collapsed) fade(part, 0, reduce ? REDUCED_FADE_MS : MOTION_NORMAL_MS);
    // A layer starts transparent (its class) and fades in once the control has begun to grow.
    if (reduce) {
      this.size(this.target(), 0);
      fade(layer, 1, REDUCED_FADE_MS);
      return;
    }
    fade(layer, 1, CONTENT_IN_MS, opening ? CONTENT_IN_DELAY_MS : MOTION_FAST_MS);
    this.size(this.target(), MOTION_SLOW_MS);
  }

  /** Fades the content out and shrinks the control back into the button. */
  close(): void {
    const layer = this.layer;
    if (layer === null || this.closing) return;
    const generation = ++this.generation;
    this.closing = true;
    this.resizes.disconnect();
    layer.addClass('atlas-online-layer--leaving');
    const done = (): void => {
      if (generation !== this.generation) return;
      layer.remove();
      this.layer = null;
      this.closing = false;
      this.goal = null;
      this.host.root.removeClass('is-open');
      this.host.root.setCssProps({ width: '', height: '' });
    };
    if (prefersReducedMotion(this.host.root)) {
      this.size(this.host.closedSize(), 0);
      for (const part of this.host.collapsed) fade(part, 1, REDUCED_FADE_MS);
      return done();
    }
    fade(layer, 0, MOTION_FAST_MS).finished.then(() => {
      if (generation !== this.generation) return;
      // The button comes back over the second half of the shrink, where it will rest.
      for (const part of this.host.collapsed) fade(part, 1, MOTION_FAST_MS, MOTION_NORMAL_MS - MOTION_FAST_MS);
      const shrinking = this.size(this.host.closedSize(), MOTION_NORMAL_MS);
      if (shrinking === null) done();
      else shrinking.finished.then(done, () => undefined);
    }, () => undefined);
  }

  /** Back to the button at once, without motion. */
  dispose(): void {
    this.generation++;
    this.resizes.disconnect();
    this.sizing?.cancel();
    for (const layer of Array.from(this.host.content.querySelectorAll('.atlas-online-layer'))) layer.remove();
    this.layer = null;
    this.closing = false;
  }

  /** Grows to the height the content asks for now (after the content or the room changed). */
  fit(duration: number = MOTION_NORMAL_MS): void {
    if (this.layer === null || this.closing) return;
    const target = this.target();
    if (this.goal !== null && sameSize(this.goal, target)) return;
    this.size(target, duration);
  }

  private target(): Size {
    const layer = this.layer;
    if (layer === null) return this.host.closedSize();
    const border = 2 * this.border();
    const max = this.host.maxHeight();
    // The content scrolls inside the room there is; its own height then fits it.
    if (Number.isFinite(max)) layer.setCssProps({ '--atlas-online-layer-max': `${Math.max(0, max - border)}px` });
    return { width: this.width, height: Math.min(layer.offsetHeight + border, max) };
  }

  /** Moves the control to `size` from where it stands now; at once for a zero duration or reduced motion. */
  private size(size: Size, duration: number): Animation | null {
    const root = this.host.root;
    const from = sizeOf(root);
    const border = this.border();
    this.sizing?.cancel();
    this.sizing = null;
    this.goal = size;
    root.setCssProps(frameOf(size, border));
    if (duration === 0 || prefersReducedMotion(root) || sameSize(from, size)) return null;
    this.sizing = root.animate([frameOf(from, border), frameOf(size, border)], { duration, easing: MOTION_EASE_OUT });
    return this.sizing;
  }

  private border(): number {
    const root = this.host.root;
    return parseFloat(root.win.getComputedStyle(root).borderTopWidth) || 0;
  }
}

/** A layer the control no longer shows fades out and goes; under reduced motion at once. */
function leave(layer: HTMLElement, reduce: boolean): void {
  layer.removeAttribute('id');
  layer.addClass('atlas-online-layer--leaving');
  if (reduce) return layer.remove();
  fade(layer, 0, MOTION_FAST_MS).finished.then(() => layer.remove(), () => layer.remove());
}
