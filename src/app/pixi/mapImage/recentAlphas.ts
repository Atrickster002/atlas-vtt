import type { ArtAlpha } from '../../levels/artRaster';

/** How many images' art is kept: a scene's floors, about 4 MB each. */
const KEPT = 6;

/**
 * Which pixels of the last few map images hold art (`ArtAlpha`), by their content's hash: a level
 * shown again, in any view, reads it without asking the tile worker. A read that fails is not kept.
 */
export class RecentAlphas {
  private readonly entries = new Map<string, Promise<ArtAlpha>>();

  /** The art of the image whose content is `hash`, read with `read` where it is not kept. */
  of(hash: string, read: () => Promise<ArtAlpha>): Promise<ArtAlpha> {
    let entry = this.entries.get(hash);
    if (entry) {
      // Most recent last.
      this.entries.delete(hash);
    } else {
      entry = read();
      entry.catch(() => {
        if (this.entries.get(hash) === entry) this.entries.delete(hash);
      });
    }
    this.entries.set(hash, entry);
    while (this.entries.size > KEPT) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }
}
