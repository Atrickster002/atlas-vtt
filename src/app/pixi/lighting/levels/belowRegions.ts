import type { TileView } from '../../mapImage/levelOfDetail';

/** What a level below's map image is asked to keep loaded. */
interface RegionHolder {
  readonly id: string;
  addDemandRegion(view: TileView): () => void;
}

/**
 * The tiles other pictures than the canvas's (the player window's frame) keep loaded on every
 * level below: a level drawn later takes up the regions there are, and one that goes lets go of them.
 */
export class BelowRegions {
  private readonly regions = new Map<TileView, Map<string, () => void>>();

  /** Keeps `view` loaded on every level in `levels`, and on those that join later; returns the function that ends it. */
  add(view: TileView, levels: Iterable<RegionHolder>): () => void {
    const releases = new Map<string, () => void>();
    this.regions.set(view, releases);
    for (const level of levels) releases.set(level.id, level.addDemandRegion(view));
    return (): void => {
      this.regions.delete(view);
      for (const release of releases.values()) release();
    };
  }

  /** A level drawn from now on keeps every region loaded. */
  join(level: RegionHolder): void {
    for (const [view, releases] of this.regions) releases.set(level.id, level.addDemandRegion(view));
  }

  /** A level that goes lets go of every region. */
  leave(levelId: string): void {
    for (const releases of this.regions.values()) {
      releases.get(levelId)?.();
      releases.delete(levelId);
    }
  }
}
