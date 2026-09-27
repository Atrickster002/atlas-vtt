import { describe, it, expect } from 'vitest';
import { gridOffsetCenteredAt, normaliseGridOffset } from '../../src/app/grid/gridPlacement';
import { createHexLayout, hexCellExtent, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import type { HexGridType } from '../../src/app/grid/hexGeometry';
import { freehandCellSize, FREEHAND_CELL_SCREEN_SIZE } from '../../src/app/pixi/FreehandGridPreview';

const HEX_TYPES: HexGridType[] = ['hex-vertical', 'hex-horizontal'];

describe('gridOffsetCenteredAt', () => {
  it('puts square grid lines half a cell around the point', () => {
    expect(gridOffsetCenteredAt('square', 80, { x: 500, y: 300 })).toEqual({ offsetX: 460, offsetY: 260 });
  });

  it.each(HEX_TYPES)('centres a %s hex on the point', (type) => {
    const point = { x: 431.5, y: 287.25 };
    const { offsetX, offsetY } = gridOffsetCenteredAt(type, 64, point);
    const center = nearestHexCenter(createHexLayout(type, 64, offsetX, offsetY), point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
  });
});

describe('normaliseGridOffset', () => {
  it('wraps square offsets into one cell', () => {
    const normalised = normaliseGridOffset('square', 80, 460, -30);
    expect(normalised.offsetX).toBeCloseTo(60, 9);
    expect(normalised.offsetY).toBeCloseTo(50, 9);
  });

  it.each(HEX_TYPES)('keeps every %s hex centre in place', (type) => {
    const size = 57;
    const point = { x: 812.3, y: 604.9 };
    const centred = gridOffsetCenteredAt(type, size, point);
    const { offsetX, offsetY } = normaliseGridOffset(type, size, centred.offsetX, centred.offsetY);
    const layout = createHexLayout(type, size, offsetX, offsetY);
    const extent = hexCellExtent(layout);

    const center = nearestHexCenter(layout, point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
    // Hex (0, 0) now contains the world origin.
    expect(Math.abs(offsetX + extent.width / 2)).toBeLessThanOrEqual(extent.width);
    expect(Math.abs(offsetY + extent.height / 2)).toBeLessThanOrEqual(extent.height);
  });
});

describe('freehandCellSize', () => {
  it('turns the fixed on-screen preview cell into world units at the current zoom', () => {
    expect(freehandCellSize(1)).toBe(FREEHAND_CELL_SCREEN_SIZE);
    expect(freehandCellSize(2)).toBe(FREEHAND_CELL_SCREEN_SIZE / 2);
    expect(freehandCellSize(0.5)).toBe(FREEHAND_CELL_SCREEN_SIZE * 2);
  });
});
