import { ASSET_CHUNK_BYTES, MAX_PARTS, type GmMessage } from '../protocol/index.ts';

/** Bytes in base64, in slices small enough for `String.fromCharCode`. */
export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

/**
 * An asset as chunk messages of at most `ASSET_CHUNK_BYTES` each, from chunk `from` on (a download a
 * player continues); an empty asset is one empty chunk.
 */
export function assetChunks(hash: string, bytes: Uint8Array, from = 0): GmMessage[] {
  const count = Math.max(1, Math.ceil(bytes.length / ASSET_CHUNK_BYTES));
  const first = Math.min(from, count - 1);
  return Array.from({ length: count - first }, (_, offset) => {
    const index = first + offset;
    return { t: 'asset-chunk' as const, hash, index, count, data: toBase64(bytes.subarray(index * ASSET_CHUNK_BYTES, (index + 1) * ASSET_CHUNK_BYTES)) };
  });
}

/**
 * A message as it goes out: itself while its JSON fits one frame, else in `part` messages of at
 * most `ASSET_CHUNK_BYTES` of its UTF-8 text each (a scene's walls may run to megabytes). None
 * for a message of more than `MAX_PARTS` parts, which no client puts together.
 */
export function messageParts(body: GmMessage, id: () => string): GmMessage[] {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  if (bytes.length <= ASSET_CHUNK_BYTES) return [body];
  const count = Math.ceil(bytes.length / ASSET_CHUNK_BYTES);
  if (count > MAX_PARTS) return [];
  const partId = id();
  return Array.from({ length: count }, (_, index) => ({
    t: 'part' as const, id: partId, index, count, data: toBase64(bytes.subarray(index * ASSET_CHUNK_BYTES, (index + 1) * ASSET_CHUNK_BYTES)),
  }));
}

/** SHA-256 of bytes, in lowercase hex. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MIME_TYPES: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

/** The image type a vault path names by its extension, or null for a type players cannot be sent. */
export function imageMimeType(path: string): string | null {
  return MIME_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** How long a player's request for the asset it is being sent is ignored. */
export const REPEAT_REQUEST_MS = 10_000;

/**
 * Which player was last sent which asset from which chunk, and when: the same request again within
 * `REPEAT_REQUEST_MS` is ignored, one from another chunk (a download continued) is not.
 */
export class ServedAssets {
  private readonly served = new Map<string, number>();

  /** Whether `player`'s request for `hash` from chunk `from` is served now; noted when it is. */
  take(player: string, hash: string, from: number, now: number): boolean {
    const key = `${player}\n${hash}\n${from}`;
    const last = this.served.get(key);
    if (last !== undefined && now - last < REPEAT_REQUEST_MS) return false;
    this.served.set(key, now);
    return true;
  }

  /** Forgets what `player` was sent (of `hash` only, at any longest side, when named): they may ask again at once. */
  forget(player: string, hash?: string): void {
    const prefix = hash === undefined ? `${player}\n` : `${player}\n${hash}`;
    for (const key of [...this.served.keys()]) if (key.startsWith(prefix)) this.served.delete(key);
  }

  clear(): void {
    this.served.clear();
  }
}
