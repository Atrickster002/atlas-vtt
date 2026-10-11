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
  /** Whether the image at a vault path may be shown as the world map: settings alone are no proof (a bundle or a hand edit may have written them). */
  mayShow(collection: string, path: string): Promise<boolean>;
  /** A map that was being read is known now. */
  read(): void;
}

/** A world map as players are sent it, and the file it is: the path is the GM's and never sent. */
export interface WorldMapFile {
  readonly map: BookWorldMap;
  readonly path: string;
}

/**
 * The campaign's world map as players are sent it: its image by hash with its size in pixels, read
 * from its bytes once and kept while the file stays as it is (its path, time and size). A file that
 * is missing, unreadable, too large or of a type players cannot be sent is no map.
 */
export class WorldMaps {
  private readonly ports: WorldMapPorts;
  /** The file last asked for, by path, time and size, with what it is; `reading` until that is known. */
  private last: { readonly key: string; readonly file: WorldMapFile | null | 'reading' } | null = null;

  constructor(ports: WorldMapPorts) {
    this.ports = ports;
  }

  /**
   * The map a collection names at a vault path: null for none, undefined while it is being read
   * (`read` hears when it has been). What was read counts for that collection alone: whether an
   * image may be shown is asked per collection.
   */
  get(path: string | null, collection: string): WorldMapFile | null | undefined {
    const stat = path === null ? null : this.ports.stat(path);
    if (path === null || stat === null || stat.size > MAX_ASSET_BYTES) return null;
    const key = `${collection}\n${path}\n${stat.mtime}\n${stat.size}`;
    if (this.last?.key === key) return this.last.file === 'reading' ? undefined : this.last.file;
    this.last = { key, file: 'reading' };
    void this.load(path, collection).then((file) => {
      if (this.last?.key !== key) return;
      this.last = { key, file };
      this.ports.read();
    });
    return undefined;
  }

  /** Forgets what was read: what may be shown as the map can change while its file stays as it is. */
  forget(): void {
    this.last = null;
  }

  private async load(path: string, collection: string): Promise<WorldMapFile | null> {
    try {
      if (!(await this.ports.mayShow(collection, path))) return null;
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
