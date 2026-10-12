import { IMAGE_MIME_TYPES, isSide, MAX_ASSET_BYTES, type BookWorldMap } from '../../protocol/index.ts';
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { sha256Hex } from '../assetServe.ts';
import type { VaultImage } from '../TokenShare.ts';

/** A vault file as it is now: when it was last written and how large it is. */
export interface FileStat {
  readonly mtime: number;
  readonly size: number;
}

export interface WorldMapPorts {
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The image at a vault path, or null when it is missing or of a type players cannot be sent. */
  readImage(path: string): Promise<VaultImage | null>;
  /** The vault path of the image that may be shown as the world map now, or null: Atlas answers from the campaign being played. */
  source(): Promise<string | null>;
  /** A map that was being looked up or read is known now. */
  read(): void;
}

/** A world map as players are sent it, and the file it is: the path is the GM's and never sent. */
export interface WorldMapFile {
  readonly map: BookWorldMap;
  readonly path: string;
}

/**
 * The campaign's world map as players are sent it: its image by hash with its size in pixels. Which
 * image it is, is asked once and again after `forget`; the image is read from its bytes once and
 * kept while the file stays as it is (its path, time and size). A file that is missing,
 * unreadable, too large or of a type players cannot be sent is no map.
 */
export class WorldMaps {
  private readonly ports: WorldMapPorts;
  /** The path of the map as last asked for, `asking` until the answer came, null when it is to be asked. */
  private path: { readonly value: string | null } | 'asking' | null = null;
  /** Counts the questions, so that the answer to one asked before `forget` is dropped. */
  private asked = 0;
  /** The file last asked for, by path, time and size, with what it is; `reading` until that is known. */
  private last: { readonly key: string; readonly file: WorldMapFile | null | 'reading' } | null = null;

  constructor(ports: WorldMapPorts) {
    this.ports = ports;
  }

  /** The world map: null for none, undefined while it is being looked up or read (`read` hears when it has been). */
  get(): WorldMapFile | null | undefined {
    const path = this.currentPath();
    if (path === undefined) return undefined;
    const stat = path === null ? null : this.ports.stat(path);
    if (path === null || stat === null || stat.size > MAX_ASSET_BYTES) return null;
    const key = `${path}\n${stat.mtime}\n${stat.size}`;
    if (this.last?.key === key) return this.last.file === 'reading' ? undefined : this.last.file;
    this.last = { key, file: 'reading' };
    void this.load(path).then((file) => {
      if (this.last?.key !== key) return;
      this.last = { key, file };
      this.ports.read();
    });
    return undefined;
  }

  /** Asks again which image is the map: the campaign, its world map or that map's artwork may be another now. A file already read is not read again. */
  forget(): void {
    this.asked += 1;
    this.path = null;
  }

  private currentPath(): string | null | undefined {
    if (this.path === 'asking') return undefined;
    if (this.path !== null) return this.path.value;
    const asked = ++this.asked;
    this.path = 'asking';
    void this.ports.source().catch(() => null).then((value) => {
      if (asked !== this.asked) return;
      this.path = { value };
      this.ports.read();
    });
    return undefined;
  }

  private async load(path: string): Promise<WorldMapFile | null> {
    try {
      const image = await this.ports.readImage(path);
      if (image === null || image.bytes.length > MAX_ASSET_BYTES || !IMAGE_MIME_TYPES.includes(image.mime)) return null;
      const size = await imageDimensions(new Blob([image.bytes], { type: image.mime }));
      if (size === null || !isSide(size.width) || !isSide(size.height)) return null;
      return { path, map: { image: { hash: await sha256Hex(image.bytes), size: image.bytes.length, mime: image.mime }, width: size.width, height: size.height } };
    } catch {
      return null;
    }
  }
}
