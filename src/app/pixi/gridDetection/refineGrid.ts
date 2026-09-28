/**
 * Precise cell size and offset for a grid hypothesis: the lattice search gets
 * within a few pixels, the lattice fit makes it sub-pixel and reports how much of
 * the grid the map's lines support.
 */

import type { GridType } from '../../grid/GridSystem';
import { normaliseGridOffset } from '../../grid/gridPlacement';
import type { GrayImage } from './grayImage';
import { fitLattice } from './latticeFit';
import { searchLattice } from './latticeSearch';

export interface RefinedGrid {
  gridType: GridType;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** Share of the grid's edges that sit on a line of the map, corrected for chance (0–1). */
  support: number;
}

export function refineGrid(image: GrayImage, gridType: GridType, roughCellSize: number): RefinedGrid | null {
  const found = searchLattice(image, gridType, roughCellSize);
  if (!found) return null;
  const fit = fitLattice(image, gridType, found);
  const { cellSize, offsetX, offsetY } = fit.candidate;
  return { gridType, cellSize, ...normaliseGridOffset(gridType, cellSize, offsetX, offsetY), support: fit.support };
}
