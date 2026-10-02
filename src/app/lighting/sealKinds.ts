import type { WallSegment } from '../types/wallTypes';

/** What a bridge blocks: one thing where the walls it joins all block that thing only, else both. */
export type BridgeKind = Pick<WallSegment, 'blocks'>;

export const BOTH: BridgeKind = {};

/** What `walls` block together: one thing if every one of them blocks that thing only, else both. */
export function kindOfAll(walls: readonly WallSegment[]): BridgeKind {
  const blocks = walls[0]?.blocks;
  return blocks !== undefined && walls.every((wall) => wall.blocks === blocks) ? { blocks } : BOTH;
}

/** What a bridge between two kinds blocks: the one thing both block and nothing else, or both. */
export function shared(a: BridgeKind, b: BridgeKind): BridgeKind {
  return a.blocks !== undefined && a.blocks === b.blocks ? { blocks: a.blocks } : BOTH;
}
