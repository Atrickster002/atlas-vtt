import { MARKS_INTERVAL_MS, type SharedCursor } from '../protocol/index.ts';
import { getDomHost } from '../../host/dom';
import type { OverlayHost } from './MarkOverlay.ts';
import { RemoteCursors } from './RemoteCursors.ts';

/** The class of the marks overlay's canvas, which the cursors lie above. */
const MARKS_CANVAS = 'atlas-online-marks';

/**
 * Other people's cursors over a map: a layer of elements laid over the map's canvas (and over the
 * marks overlay, when there is one), which lets every pointer event through. It draws on the display
 * frames of the canvas's own window, and only while a cursor is drawn or fading: with nobody's cursor
 * on the map it asks for no frame. Its layer is made with the first cursor to show.
 */
export class CursorOverlay {
  private readonly labelOf: (cursor: SharedCursor) => string;
  private layer: HTMLDivElement | null = null;
  private cursors: RemoteCursors | null = null;
  private host: OverlayHost | null = null;
  private frame: number | null = null;
  private size = { width: -1, height: -1 };

  /** `labelOf` names a cursor's tag. */
  constructor(labelOf: (cursor: SharedCursor) => string) {
    this.labelOf = labelOf;
  }

  /** Shows `cursors` as they are now over `host`'s map: everyone's but the viewer's own. */
  show(cursors: readonly SharedCursor[], host: OverlayHost): void {
    if (this.cursors === null && cursors.length === 0) return;
    this.attach(host);
    this.cursors?.update(cursors, performance.now());
    this.wake();
  }

  /** Nobody's cursor shows; what is drawn fades away. */
  clear(): void {
    if (this.host !== null) this.cursors?.update([], performance.now());
    this.wake();
  }

  dispose(): void {
    this.stop();
    this.cursors?.clear();
    this.layer?.remove();
    this.layer = null;
    this.cursors = null;
    this.host = null;
  }

  /** Lays the layer over `host`'s canvas, above the marks overlay's; a new canvas moves it. */
  private attach(host: OverlayHost): void {
    if (this.host?.canvas === host.canvas && this.host.viewport === host.viewport && this.layer?.isConnected === true) return;
    this.stop();
    this.host = host;
    const layer = this.layer ?? getDomHost().createDiv(host.canvas.ownerDocument.body, 'atlas-online-cursors');
    this.layer = layer;
    this.cursors ??= new RemoteCursors(layer, this.labelOf, MARKS_INTERVAL_MS);
    let anchor: Element = host.canvas;
    while (anchor.nextElementSibling?.classList.contains(MARKS_CANVAS) === true) anchor = anchor.nextElementSibling;
    anchor.after(layer);
    this.size = { width: -1, height: -1 };
  }

  private wake(): void {
    const view = this.host?.canvas.ownerDocument.defaultView;
    if (this.frame !== null || view === null || view === undefined || this.cursors === null) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.tick();
    });
  }

  private stop(): void {
    if (this.frame !== null) this.host?.canvas.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private tick(): void {
    const { host, layer, cursors } = this;
    if (host === null || layer === null || cursors === null) return;
    // The map under the layer is gone: its cursors go with it until they are shown over a live one.
    if (host.viewport.destroyed === true || !host.canvas.isConnected) {
      cursors.clear();
      layer.remove();
      return;
    }
    const { clientWidth: width, clientHeight: height } = host.canvas;
    if (width !== this.size.width || height !== this.size.height) {
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
      this.size = { width, height };
    }
    const view = host.canvas.ownerDocument.defaultView;
    const camera = { x: host.viewport.x, y: host.viewport.y, scale: host.viewport.scale.x };
    cursors.tick(performance.now(), camera, view?.devicePixelRatio || 1);
    // While a cursor is drawn the camera is read every frame: a pan or zoom it is not told of still moves it.
    if (cursors.size > 0) this.wake();
  }
}
