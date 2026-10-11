import type { GmMessage, PlayerAssetRequest } from '../protocol/index.ts';
import { assetChunks, ServedAssets, sha256Hex } from './assetServe.ts';
import { AssetVariants, type ScaleImage } from './assetVariants.ts';
import type { VaultImage } from './TokenShare.ts';

export interface AssetAnswerPorts {
  send(body: GmMessage, to: string): void;
  now(): number;
  readImage(path: string): Promise<VaultImage | null>;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage | undefined;
}

/**
 * What a player may be sent now: the assets of their current picture. Each question names the player
 * who asks, for a picture that is not the same for everyone (a player's own book).
 */
export interface PictureAssets {
  /** The shared map's image, while one is shared. */
  map(player: string): { readonly hash: string; readonly bytes: Uint8Array; readonly mime: string } | null;
  /** The explored memory by hash, while it is the one players were sent. */
  explored(hash: string, player: string): Uint8Array | undefined;
  /** The vault path of artwork the picture shows (a token's or an initiative portrait's), by hash. */
  artPath(hash: string, player: string): string | undefined;
}

/**
 * Answers players' asset requests: only for the map, the explored memory or artwork of their current
 * picture, from the chunk they ask for on, and an image larger than a longest side they ask for as a
 * scaled copy (`AssetVariants`) announced by an `asset-variant` message. Anything else is refused.
 */
export class AssetAnswers {
  private readonly served = new ServedAssets();
  private readonly variants: AssetVariants | null;

  constructor(private readonly ports: AssetAnswerPorts, private readonly picture: PictureAssets) {
    this.variants = ports.scaleImage === undefined ? null : new AssetVariants(ports.scaleImage);
  }

  answer(from: string, request: PlayerAssetRequest): void {
    const { hash, maxSide } = request;
    const first = request.from ?? 0;
    const map = this.picture.map(from);
    const isMap = map?.hash === hash;
    const explored = isMap ? undefined : this.picture.explored(hash, from);
    const art = isMap || explored !== undefined ? undefined : this.picture.artPath(hash, from);
    if (!isMap && explored === undefined && art === undefined) return this.refuse(hash, from);
    if (!this.served.take(from, maxSide === undefined ? hash : `${hash}@${maxSide}`, first, this.ports.now())) return;
    if (explored !== undefined) return this.serve(hash, explored, from, first);
    if (isMap) return void this.serveImage(hash, map.bytes, map.mime, from, first, maxSide);
    if (art !== undefined) void this.serveArt(hash, art, from, first, maxSide);
  }

  /** A player left, or the picture changed for all (`undefined`): requests may come again at once. */
  forget(player?: string): void {
    if (player === undefined) this.served.clear();
    else this.served.forget(player);
  }

  /** Reads artwork again and serves it while it still has the hash the player's picture names. */
  private async serveArt(hash: string, path: string, to: string, first: number, maxSide: number | undefined): Promise<void> {
    const image = await this.ports.readImage(path).catch(() => null);
    if (image === null || this.picture.artPath(hash, to) !== path || (await sha256Hex(image.bytes)) !== hash) return this.refuse(hash, to);
    await this.serveImage(hash, image.bytes, image.mime, to, first, maxSide);
  }

  /** The image itself, or its scaled copy for `maxSide`, while it is still in the picture once the copy is made. */
  private async serveImage(hash: string, bytes: Uint8Array, mime: string, to: string, first: number, maxSide: number | undefined): Promise<void> {
    if (maxSide === undefined || this.variants === null) return this.serve(hash, bytes, to, first);
    const variant = await this.variants.get(hash, bytes, mime, maxSide);
    if (!this.inPicture(hash, to)) return this.refuse(hash, to);
    if (variant === null) return this.serve(hash, bytes, to, first);
    this.ports.send({ t: 'asset-variant', hash, maxSide, variant: variant.ref, width: variant.width, height: variant.height }, to);
    this.serve(variant.ref.hash, variant.bytes, to, first);
  }

  private inPicture(hash: string, player: string): boolean {
    return this.picture.map(player)?.hash === hash || this.picture.artPath(hash, player) !== undefined;
  }

  private serve(hash: string, bytes: Uint8Array, to: string, first: number): void {
    for (const chunk of assetChunks(hash, bytes, first)) this.ports.send(chunk, to);
  }

  private refuse(hash: string, to: string): void {
    this.served.forget(to, hash);
    this.ports.send({ t: 'asset-refused', hash }, to);
  }
}
