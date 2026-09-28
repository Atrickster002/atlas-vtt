import { axialToPixel, hexCircumradius, hexOriginCenter } from './hexGeometry';
import type { AxialCoord, HexLayout, Point } from './hexGeometry';

/**
 * How hexes are numbered. `column-row` is the hexcrawl convention ("0304" is
 * column 3, row 4); `sequential` counts 1, 2, 3 in reading order.
 */
export type HexNumberFormat = 'column-row' | 'sequential';

export function isHexNumberFormat(value: unknown): value is HexNumberFormat {
  return value === 'column-row' || value === 'sequential';
}

/** How a grid shows its hex numbers; a grid without numbers has none. */
export interface HexNumberStyle {
  format: HexNumberFormat;
  /** 0 to 1, separate from the grid lines' opacity. */
  opacity: number;
}

export const DEFAULT_HEX_NUMBER_OPACITY = 0.8;

/** The hex number style a grid's settings ask for, or undefined when numbers are off. */
export function hexNumberStyleOfGrid(
  grid: { hexNumbers?: HexNumberFormat | undefined; hexNumberOpacity?: number | undefined } | null | undefined,
): HexNumberStyle | undefined {
  if (!grid || !isHexNumberFormat(grid.hexNumbers)) return undefined;
  return { format: grid.hexNumbers, opacity: grid.hexNumberOpacity ?? DEFAULT_HEX_NUMBER_OPACITY };
}

/** The map image in world space. */
export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NumberedHex {
  coord: AxialCoord;
  center: Point;
  label: string;
}

/**
 * A hex is on the map when its centre lies at least this share of the hex size
 * inside every edge, so hexes the map edge cuts in half get no number and every
 * column (flat) or row (pointy) starts counting at its first whole hex.
 */
const EDGE_MARGIN = 0.4;
const EPSILON = 1e-6;

interface OnMapHex {
  coord: AxialCoord;
  row: number;
  column: number;
}

/**
 * The hexes on the map with their 0-based row and column. Lines are the grid's
 * columns on flat-top grids and its rows on pointy-top grids; each line counts
 * from its first hex on the map, which follows the half-cell stagger.
 */
function hexesOnMap(layout: HexLayout, map: MapRect): OnMapHex[] {
  const isPointy = layout.orientation === 'pointy';
  const size = layout.size;
  const lineSpacing = 1.5 * hexCircumradius(size);
  const origin = hexOriginCenter(layout);
  const margin = EDGE_MARGIN * size;

  const acrossOrigin = isPointy ? origin.y : origin.x;
  const alongOrigin = isPointy ? origin.x : origin.y;
  const acrossMin = (isPointy ? map.y : map.x) + margin;
  const acrossMax = (isPointy ? map.y + map.height : map.x + map.width) - margin;
  const alongMin = (isPointy ? map.x : map.y) + margin;
  const alongMax = (isPointy ? map.x + map.width : map.y + map.height) - margin;

  const firstLine = Math.ceil((acrossMin - acrossOrigin) / lineSpacing - EPSILON);
  const lastLine = Math.floor((acrossMax - acrossOrigin) / lineSpacing + EPSILON);

  const hexes: OnMapHex[] = [];
  for (let line = firstLine; line <= lastLine; line++) {
    const phase = line / 2;
    const firstHex = Math.ceil((alongMin - alongOrigin) / size - phase - EPSILON);
    const lastHex = Math.floor((alongMax - alongOrigin) / size - phase + EPSILON);
    for (let index = firstHex; index <= lastHex; index++) {
      const coord = isPointy ? { q: index, r: line } : { q: line, r: index };
      const lineNumber = line - firstLine;
      const indexInLine = index - firstHex;
      hexes.push(
        isPointy
          ? { coord, row: lineNumber, column: indexInLine }
          : { coord, row: indexInLine, column: lineNumber },
      );
    }
  }
  return hexes;
}

function padded(value: number, digits: number): string {
  return String(value).padStart(digits, '0');
}

/** Numbers every hex on the map; hexes the map edge cuts off get no number. */
export function numberHexes(layout: HexLayout, map: MapRect, format: HexNumberFormat): NumberedHex[] {
  if (!(layout.size > 0) || !(map.width > 0) || !(map.height > 0)) return [];
  const hexes = hexesOnMap(layout, map);

  if (format === 'sequential') {
    const readingOrder = [...hexes].sort((a, b) => a.row - b.row || a.column - b.column);
    return readingOrder.map((hex, index) => ({
      coord: hex.coord,
      center: axialToPixel(layout, hex.coord),
      label: String(index + 1),
    }));
  }

  const columns = hexes.reduce((most, hex) => Math.max(most, hex.column + 1), 0);
  const rows = hexes.reduce((most, hex) => Math.max(most, hex.row + 1), 0);
  const columnDigits = Math.max(2, String(columns).length);
  const rowDigits = Math.max(2, String(rows).length);
  return hexes.map((hex) => ({
    coord: hex.coord,
    center: axialToPixel(layout, hex.coord),
    label: padded(hex.column + 1, columnDigits) + padded(hex.row + 1, rowDigits),
  }));
}

export function axialKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

/** Hex labels by `axialKey`, for looking up a single hex's number. */
export function hexLabelsByCoord(hexes: readonly NumberedHex[]): Map<string, string> {
  return new Map(hexes.map((hex) => [axialKey(hex.coord), hex.label]));
}

/** Where a hex's number sits: just below the top of the hex, clear of tokens and pins at its centre. */
export function hexNumberAnchor(layout: HexLayout, center: Point): Point {
  return { x: center.x, y: center.y - 0.37 * layout.size };
}

/** Font size of hex numbers in world pixels. */
export function hexNumberFontSize(layout: HexLayout): number {
  return 0.16 * layout.size;
}
