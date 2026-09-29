import { IMAGE_PRESETS, optimizeImage, renderFramedImage, type ProcessedImage, type ThumbnailSpec } from '../../../../imageProcessing/imageProcessing';
import { THUMBNAIL_SPEC } from '../../../../services/AssetThumbnailService';
import { tokenCropPlacement } from './cropMath';
import type { CreatorMode, ImagePosition } from './types';

/** Token images never get fewer pixels than this, so small art stays usable on the map. */
const MIN_TOKEN_SIZE = 256;
/** What a preview card shows of a map: sharp at the card's largest size on a 2x display, and cheap to paint. */
const MAP_CARD_PREVIEW: ThumbnailSpec = { size: 640, quality: 0.8 };

/**
 * The whole upload as a map or unframed token saves it, with its thumbnail.
 * Maps also get a card-sized copy: painting a full map in a preview card
 * stalls the window.
 */
export function optimizeUpload(file: File, mode: CreatorMode, signal?: AbortSignal): Promise<ProcessedImage> {
  return optimizeImage(file, IMAGE_PRESETS[mode], {
    signal, thumbnail: THUMBNAIL_SPEC, ...(mode === 'map' && { heavy: true, preview: MAP_CARD_PREVIEW }),
  });
}

/** What the preview shows inside the token circle, taken from the full-resolution upload, with its thumbnail. */
export function cropTokenImage(file: File, scale: number, position: ImagePosition, signal?: AbortSignal): Promise<ProcessedImage> {
  const { maxWidth, quality } = IMAGE_PRESETS.token;
  return renderFramedImage(file, tokenCropPlacement(scale, position), {
    minSize: MIN_TOKEN_SIZE, maxSize: maxWidth, quality, thumbnail: THUMBNAIL_SPEC, signal,
  });
}
