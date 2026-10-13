import type { AssetRef } from '../protocol/index.ts';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import { sha256Hex } from './assetServe.ts';

/** An image scaled down to fit a longest side, and the size of the image it was made from. */
export interface ScaledImage {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

/** Scales an image to fit `maxSide`; null when it cannot be read or already fits. */
export type ScaleImage = (bytes: Uint8Array, mime: string, maxSide: number) => Promise<ScaledImage | null>;

/** A scaled copy as the players get it: its own reference and bytes, and the original's size. */
export interface AssetVariantOf {
  readonly ref: AssetRef;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Copies kept at once: an 8,192 px map makes one of a few megabytes, and a table shows one map. */
export const VARIANT_CAPACITY = 3;
/** WebP quality of a scaled copy: maps and art stay sharp, a tenth or less of the original's bytes. */
export const VARIANT_QUALITY = 0.9;

/**
 * Scaled copies of the images players ask for at a longest side (a phone holds a 4,096 px map, not
 * an 8,192 px one), made once and kept for the last `VARIANT_CAPACITY` asked for. Whether a player
 * may have the image at all is the caller's question, asked before every request (the image must
 * be in their current picture).
 */
export class AssetVariants {
  private readonly made = new Map<string, Promise<AssetVariantOf | null>>();

  constructor(private readonly scale: ScaleImage, private readonly capacity = VARIANT_CAPACITY) {}

  /** The copy of `bytes` (the image `hash`) for `maxSide`, or null when the image fits as it is or cannot be scaled. */
  get(hash: string, bytes: Uint8Array, mime: string, maxSide: number): Promise<AssetVariantOf | null> {
    const key = `${hash}@${maxSide}`;
    let variant = this.made.get(key);
    if (variant === undefined) {
      variant = this.make(bytes, mime, maxSide);
      // A copy that failed is not kept: the next request tries again.
      variant.then((made) => made === null && this.made.get(key) === variant && this.made.delete(key), () => this.made.delete(key));
    } else this.made.delete(key);
    this.made.set(key, variant);
    while (this.made.size > this.capacity) this.made.delete(this.made.keys().next().value!);
    return variant;
  }

  clear(): void {
    this.made.clear();
  }

  private async make(bytes: Uint8Array, mime: string, maxSide: number): Promise<AssetVariantOf | null> {
    const size = await imageDimensions(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime })).catch(() => null);
    if (size !== null && Math.max(size.width, size.height) <= maxSide) return null;
    const scaled = await this.scale(bytes, mime, maxSide).catch(() => null);
    // What a phone holds is the decoded image, so a larger image comes scaled even where its copy has more bytes.
    if (scaled === null) return null;
    const copy = new Uint8Array(scaled.bytes);
    return { ref: { hash: await sha256Hex(copy), size: copy.length, mime: scaled.mime }, bytes: copy, width: scaled.width, height: scaled.height };
  }
}

/**
 * Scales an image in Obsidian's own window with the browser's decoder (off the main thread) and
 * encodes the copy as WebP: `createImageBitmap` resizes with high quality, an `OffscreenCanvas` encodes.
 */
export async function scaleInWindow(bytes: Uint8Array, mime: string, maxSide: number): Promise<ScaledImage | null> {
  const blob = new Blob([bytes], { type: mime });
  const original = await createImageBitmap(blob);
  const { width, height } = original;
  original.close();
  const fit = maxSide / Math.max(width, height);
  if (fit >= 1) return null;
  const outWidth = Math.max(1, Math.round(width * fit));
  const outHeight = Math.max(1, Math.round(height * fit));
  const resized = await createImageBitmap(blob, { resizeWidth: outWidth, resizeHeight: outHeight, resizeQuality: 'high' });
  try {
    const canvas = new OffscreenCanvas(outWidth, outHeight);
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(resized, 0, 0);
    const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: VARIANT_QUALITY });
    // A browser that cannot encode WebP gives PNG back, which players also take.
    return { bytes: new Uint8Array(await encoded.arrayBuffer()), mime: encoded.type, width, height };
  } finally {
    resized.close();
  }
}
