import type { GridType } from './GridSystem';
import { axialToPixel, createHexLayout, hexCellExtent, isHexGridType, pixelToAxial } from './hexGeometry';
import type { Point } from './hexGeometry';

export interface GridOffset {
  offsetX: number;
  offsetY: number;
}

function mod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Keeps offsets small without moving the grid: square offsets modulo the cell, hex offsets re-based to the hex containing the origin. */
export function normaliseGridOffset(gridType: GridType, cellSize: number, offsetX: number, offsetY: number): GridOffset {
  if (!isHexGridType(gridType)) return { offsetX: mod(offsetX, cellSize), offsetY: mod(offsetY, cellSize) };
  const layout = createHexLayout(gridType, cellSize, offsetX, offsetY);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);
  return { offsetX: anchor.x - extent.width / 2, offsetY: anchor.y - extent.height / 2 };
}

/** Offsets of the grid whose cell `(0, 0)` is centred on `point`. */
export function gridOffsetCenteredAt(gridType: GridType, cellSize: number, point: Point): GridOffset {
  const extent = isHexGridType(gridType)
    ? hexCellExtent(createHexLayout(gridType, cellSize, 0, 0))
    : { width: cellSize, height: cellSize };
  return { offsetX: point.x - extent.width / 2, offsetY: point.y - extent.height / 2 };
}
