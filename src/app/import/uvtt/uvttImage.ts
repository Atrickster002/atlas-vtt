import { refuse } from './uvttFields';
import type { UvttImage, UvttImageType } from './uvttTypes';

/** A data URL's head, which some exporters put before the image. What it claims is not read. */
const DATA_URL_HEAD = /^data:[^,]{0,100},/;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The image format the bytes begin as, by their signature. */
export function imageTypeOf(bytes: Uint8Array): UvttImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return refuse('The map image in the file is damaged (it is not valid base64).');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The map image of a file: its `image` field decoded, and its type as the bytes themselves say. */
export function readImage(value: unknown): UvttImage {
  if (typeof value !== 'string' || value === '') return refuse('The file holds no map image.');
  const bytes = decodeBase64(value.replace(DATA_URL_HEAD, ''));
  const type = imageTypeOf(bytes);
  return type ? { bytes, type } : refuse('The map image in the file is not a PNG, WebP or JPEG image.');
}
