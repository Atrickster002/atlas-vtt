import { BitmapText, Cache, Container, DynamicBitmapFont, TextStyle } from 'pixi.js';
import { hexNumberAnchor, hexNumberFontSize } from './hexNumbering';
import type { NumberedHex } from './hexNumbering';
import type { HexLayout, Point } from './hexGeometry';

/**
 * Glyph atlas sizes in device pixels. Labels read from the smallest atlas at
 * least as large as they appear on screen, so the GPU scales glyphs down by
 * less than 2x and plain linear filtering keeps them sharp.
 */
const RASTER_SIZES = [16, 32, 64, 128, 256] as const;
type RasterSize = (typeof RASTER_SIZES)[number];
/** Numbers smaller than this on screen (CSS pixels) are unreadable noise, so they hide until zoomed in. */
const MIN_SCREEN_FONT_SIZE = 7;

function fontName(size: RasterSize): string {
  return `atlas-hex-numbers-${size}`;
}

function rasterSizeFor(devicePixels: number): RasterSize {
  return RASTER_SIZES.find((size) => size >= devicePixels) ?? RASTER_SIZES[RASTER_SIZES.length - 1]!;
}

/**
 * A white digit atlas at one raster size, shared by every hex number. Labels
 * take the grid colour as a tint. Built like `BitmapFontManager.install`, but
 * without mipmaps: a mip level is picked for any downscale and blurs the digits.
 */
function ensureHexNumberFont(size: RasterSize): string {
  const name = fontName(size);
  const cacheKey = `${name}-bitmap`;
  if (Cache.has(cacheKey)) return name;
  const font = new DynamicBitmapFont({
    style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: 'bold', fill: 0xffffff }),
    overrideFill: false,
    overrideSize: false,
    mipmap: false,
    skipKerning: true,
    textureSize: Math.max(512, size * 4),
  });
  font.ensureCharacters('0123456789');
  Cache.set(cacheKey, font);
  font.once('destroy', () => Cache.remove(cacheKey));
  return name;
}

export interface HexNumberLabelStyle {
  color: number;
  opacity: number;
}

/** How the viewport shows the grid: its zoom and the renderer's device pixel ratio. */
export interface HexNumberView {
  zoom: number;
  pixelRatio: number;
}

/** The numbers of a hex grid, laid out in the grid container's local space. */
export class HexNumberLabels {
  readonly container: Container;
  private readonly labels: BitmapText[] = [];
  private readonly fontSize: number;
  private rasterSize: RasterSize;

  constructor(
    hexes: readonly NumberedHex[],
    layout: HexLayout,
    localOrigin: Point,
    style: HexNumberLabelStyle,
    view: HexNumberView,
  ) {
    this.fontSize = hexNumberFontSize(layout);
    this.container = new Container({ label: 'hex-numbers', eventMode: 'none', interactiveChildren: false });
    this.container.alpha = style.opacity;
    this.container.visible = this.isReadable(view.zoom);
    this.rasterSize = rasterSizeFor(this.fontSize * view.zoom * view.pixelRatio);
    const fontFamily = ensureHexNumberFont(this.rasterSize);

    for (const hex of hexes) {
      const anchor = hexNumberAnchor(layout, hex.center);
      const label = new BitmapText({ text: hex.label, style: { fontFamily, fontSize: this.fontSize } });
      label.anchor.set(0.5);
      label.position.set(anchor.x - localOrigin.x, anchor.y - localOrigin.y);
      label.tint = style.color;
      this.labels.push(label);
      this.container.addChild(label);
    }
  }

  setOpacity(opacity: number): void {
    this.container.alpha = opacity;
  }

  private isReadable(zoom: number): boolean {
    return this.fontSize * zoom >= MIN_SCREEN_FONT_SIZE;
  }

  /** Picks the glyph atlas for the numbers' size on screen and hides them while too small to read. */
  setView({ zoom, pixelRatio }: HexNumberView): void {
    const readable = this.isReadable(zoom);
    if (this.container.visible !== readable) this.container.visible = readable;
    if (!readable) return;

    const rasterSize = rasterSizeFor(this.fontSize * zoom * pixelRatio);
    if (rasterSize === this.rasterSize) return;
    this.rasterSize = rasterSize;
    const fontFamily = ensureHexNumberFont(rasterSize);
    for (const label of this.labels) label.style.fontFamily = fontFamily;
  }
}
