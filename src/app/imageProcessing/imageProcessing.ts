import type { FramePlacement, ImageJob, ImageJobResult, ThumbnailSpec } from './imageJob';
import { withDecodedImage } from './imageElement';
import { ImageDecodeError, ImageWorkerPool, type ImageJobOptions } from './ImageWorkerPool';
import ImageWorker from './imageWorker?worker&inline';

export type { FramePlacement, ThumbnailSpec, ImageJobResult as ProcessedImage } from './imageJob';

/**
 * Image conversion for imports: decoding, scaling and WebP encoding run in a
 * pool of workers, so Obsidian stays responsive and a batch uses several
 * cores. Browsers encode images on the CPU only; parallel workers are what
 * make a batch faster.
 */

export interface ImagePreset {
  maxWidth: number;
  maxHeight: number;
  /** WebP quality, 0–1. */
  quality: number;
}

export const IMAGE_PRESETS = {
  token: { maxWidth: 400, maxHeight: 400, quality: 0.85 },
  map: { maxWidth: 8192, maxHeight: 8192, quality: 0.8 },
} as const satisfies Record<string, ImagePreset>;

export interface ProcessOptions {
  signal?: AbortSignal | undefined;
  thumbnail?: ThumbnailSpec | undefined;
  preview?: ThumbnailSpec | undefined;
  /** Marks a source whose pixels need a lot of memory; defaults to a guess from its file size. */
  heavy?: boolean;
}

/** Workers beyond this add little for batches of token art and cost memory. */
const MAX_WORKERS = 6;
/** Sources larger than this are treated as heavy unless the caller says otherwise. */
const HEAVY_SOURCE_BYTES = 16 * 1024 * 1024;
/** Longer side of a vector image (SVG) once rasterized; vectors have no pixels of their own. */
const VECTOR_RASTER_SIZE = 2048;
const SVG = 'image/svg+xml';

let pool: ImageWorkerPool | null = null;

function workerPool(): ImageWorkerPool {
  pool ??= new ImageWorkerPool(workerCount(), () => new ImageWorker({ name: 'Atlas image processing' }));
  return pool;
}

/** One core stays free for Obsidian itself. */
function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 1));
}

/** Stops the workers; called when the plugin unloads. */
export function disposeImageProcessing(): void {
  pool?.dispose();
  pool = null;
}

/** Rasterizes `blob` on the main thread for formats workers cannot decode. */
function rasterize(blob: Blob): Promise<ImageBitmap> {
  return withDecodedImage(blob, (image) => {
    const width = image.naturalWidth || VECTOR_RASTER_SIZE;
    const height = image.naturalHeight || VECTOR_RASTER_SIZE;
    const scale = blob.type === SVG ? VECTOR_RASTER_SIZE / Math.max(width, height) : 1;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a drawing surface for the image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.transferToImageBitmap();
  });
}

async function process(source: Blob, job: Omit<ImageJob, 'source'>, options: ProcessOptions): Promise<ImageJobResult> {
  const run: ImageJobOptions = { signal: options.signal, heavy: options.heavy ?? source.size > HEAVY_SOURCE_BYTES };
  const withCopies = { ...job, thumbnail: options.thumbnail, preview: options.preview };
  try {
    return await workerPool().run({ ...withCopies, source }, run);
  } catch (error) {
    if (!(error instanceof ImageDecodeError)) throw error;
    const bitmap = await rasterize(source);
    return workerPool().run({ ...withCopies, source: bitmap }, { ...run, transfer: [bitmap] });
  }
}

/** `source` scaled down to fit the preset and encoded as WebP. */
export function optimizeImage(source: Blob, preset: ImagePreset, options: ProcessOptions = {}): Promise<ImageJobResult> {
  return process(source, { layout: { kind: 'fit', maxWidth: preset.maxWidth, maxHeight: preset.maxHeight }, quality: preset.quality }, options);
}

export interface FrameOptions extends ProcessOptions {
  minSize: number;
  maxSize: number;
  quality: number;
}

/** A square WebP of `source` placed in a frame; areas it does not cover stay transparent. */
export function renderFramedImage(source: Blob, placement: FramePlacement, options: FrameOptions): Promise<ImageJobResult> {
  const { minSize, maxSize, quality } = options;
  return process(source, { layout: { kind: 'frame', placement, minSize, maxSize }, quality }, options);
}

/** WebP bytes of `source` whose longer side is at most `spec.size` pixels. */
export async function renderThumbnail(source: Blob, spec: ThumbnailSpec): Promise<ArrayBuffer> {
  const { image } = await optimizeImage(source, { maxWidth: spec.size, maxHeight: spec.size, quality: spec.quality });
  return image.arrayBuffer();
}
