import { headerOf } from '../../imageProcessing/imageDimensions';
import { ASSET_CHUNK_BYTES, IMAGE_MIME_TYPES, MAX_PARTS, type GmMessage } from '../protocol/index.ts';

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

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

/** The image type an image's bytes say it has, or null for bytes of a type players cannot be sent (or no image). */
export function imageMimeOfBytes(bytes: Uint8Array): string | null {
  if (ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 12))) return 'image/avif';
  const format = headerOf(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))?.format;
  const mime = format === undefined ? null : `image/${format}`;
  return mime !== null && IMAGE_MIME_TYPES.includes(mime) ? mime : null;
}

/** How long a player's request for the asset it is being sent is ignored. */
export const REPEAT_REQUEST_MS = 10_000;
/**
 * How often one player is sent one asset within `REPEAT_REQUEST_MS`, whatever chunk or longest side
 * they ask for: the first request, a download continued, and one to spare. The chunk and the side
 * are the player's to choose, so without this every other value would be a new request, each one
 * the whole asset sent again or a new scaled copy made.
 */
export const MAX_SERVES_PER_ASSET = 3;

/**
 * Which player was last sent which asset from which chunk, and when: the same request again within
 * `REPEAT_REQUEST_MS` is ignored, one from another chunk (a download continued) is not, up to
 * `MAX_SERVES_PER_ASSET` of one asset. Forgetting a player (they left, or were refused) lets them
 * repeat a request at once but never empties that count, or leaving and coming back would.
 */
export class ServedAssets {
  /** Requests by player, asset with its side, and chunk: what a repeat is told by. */
  private readonly served = new Map<string, number>();
  /** When each player was sent each asset, whatever they asked for: what the cap counts. */
  private readonly sends = new Map<string, number[]>();
  /** When what is older than the window was last dropped. */
  private lastSweep = 0;

  /** How many requests and counts are remembered now. */
  get size(): number {
    return this.served.size + this.sends.size;
  }

  /** Whether `player`'s request for `hash` (an asset, or `asset@side`) from chunk `from` is served now; noted when it is. */
  take(player: string, hash: string, from: number, now: number): boolean {
    // Once a window, so nothing older than a window is ever kept, however long a scene stands.
    if (now - this.lastSweep >= REPEAT_REQUEST_MS) this.sweep(now);
    const key = `${player}\n${hash}\n${from}`;
    const last = this.served.get(key);
    if (last !== undefined && now - last < REPEAT_REQUEST_MS) return false;
    const asset = `${player}\n${hash.split('@', 1)[0] ?? hash}`;
    const recent = (this.sends.get(asset) ?? []).filter((at) => now - at < REPEAT_REQUEST_MS);
    if (recent.length >= MAX_SERVES_PER_ASSET) return false;
    this.sends.set(asset, [...recent, now]);
    this.served.set(key, now);
    return true;
  }

  /** Drops every request and count older than the window: they decide nothing any more. */
  private sweep(now: number): void {
    this.lastSweep = now;
    const old = (at: number): boolean => now - at >= REPEAT_REQUEST_MS;
    for (const [key, at] of [...this.served]) if (old(at)) this.served.delete(key);
    for (const [asset, times] of [...this.sends]) if (times.every(old)) this.sends.delete(asset);
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
