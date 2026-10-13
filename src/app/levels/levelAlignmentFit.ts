import { NO_STRETCH, type MapStretch } from '../grid/mapStretch';
import type { GridState } from '../types/gridTypes';
import type { LevelAlignment } from '../types/sceneLevelTypes';

/** A grid found on a level's image as it is drawn on its own: from its corner, with `mapStretch` alone. */
export interface FoundGrid {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  mapStretch?: MapStretch | undefined;
}

/**
 * How far the scene's grid can be moved and lie on itself again: one cell either way on a square
 * grid; on a hex grid one hex along its rows and two rows (√3 cells) across them.
 */
function gridPeriod(grid: GridState): { x: number; y: number } {
  const across = grid.size * Math.sqrt(3);
  if (grid.type === 'hex-vertical') return { x: grid.size, y: across };
  if (grid.type === 'hex-horizontal') return { x: across, y: grid.size };
  return { x: grid.size, y: grid.size };
}

/** `value` moved by whole `period`s to lie nearest `near`, and never below 0. */
function nearestPlace(value: number, period: number, near: number): number {
  let placed = value + Math.round((near - value) / period) * period;
  while (placed < 0) placed += period;
  return Math.round(placed * 1e4) / 1e4;
}

/**
 * The alignment that lays level image's grid `found` on the scene's `grid`: the image drawn with the
 * stretch it was found with, scaled so its cells are the scene's, and moved so its lines lie on the
 * scene's, by the shift nearest to where the level lay (`current`), so a floor fitted again stays over
 * the floor below. The grid itself never changes.
 */
export function fittedLevelAlignment(grid: GridState, found: FoundGrid, current: LevelAlignment | undefined): LevelAlignment {
  const scale = grid.size / found.cellSize;
  const period = gridPeriod(grid);
  const near = current?.offset ?? { x: 0, y: 0 };
  return {
    offset: {
      x: nearestPlace(grid.offsetX - scale * found.offsetX, period.x, near.x),
      y: nearestPlace(grid.offsetY - scale * found.offsetY, period.y, near.y),
    },
    scale,
    stretch: found.mapStretch ?? NO_STRETCH,
  };
}
