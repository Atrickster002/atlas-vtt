/**
 * What a view of one level shows at each place: the level itself, a level below it seen through
 * an opening, or nothing (VOID). One raster on a fixed grid of texels that the rule (`shownAt`,
 * perception of tokens below) and the picture (the composite, the eraser) both read, byte for
 * byte, so nothing below is ever drawn where the rule does not count it.
 */

import type { LevelSurface, SceneLevel } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import { polygonBox, polygonTexels, type TexelBox } from './surfaceRaster';

/** The levels below one that are drawn at most; the stack reads every other one as VOID. */
export const MAX_LEVELS_SHOWN_BELOW = 1;
/** The longest side of the stack's grid in texels: a larger map gets texels of more than one world pixel. */
export const STACK_MAX_SIDE = 2048;
/** The level the view shows. */
export const VIEWED = 0;
/** Nothing is shown: no level below is drawn there, or none has floor there. */
export const VOID = 255;

/** The stack's texels over the viewed level's map, from the world's origin: `texel` world pixels a side. */
export interface StackGrid {
  width: number;
  height: number;
  texel: number;
  columns: number;
  rows: number;
}

/** The grid over a map of `bounds`: square texels of one world pixel, larger on maps over `STACK_MAX_SIDE` px. */
export function stackGrid(bounds: { width: number; height: number }): StackGrid {
  const texel = Math.max(1, Math.max(bounds.width, bounds.height) / STACK_MAX_SIDE);
  return {
    width: bounds.width,
    height: bounds.height,
    texel,
    // Less a rounding error's worth: the longer side of a large map is 2,048 texels, not one more.
    columns: Math.max(1, Math.ceil(bounds.width / texel - 1e-9)),
    rows: Math.max(1, Math.ceil(bounds.height / texel - 1e-9)),
  };
}

/**
 * What the view shows, by texel. Outside `box` it is the viewed level; inside, `cells` holds the
 * index into `levels` (0 the viewed level, 1 the level below shown) or `VOID`.
 */
export interface LevelStack {
  grid: StackGrid;
  /** The viewed level, then the levels below drawn, nearest first. */
  levels: readonly string[];
  /** The texels where the view shows anything but its own level; null where it shows only that. */
  box: TexelBox | null;
  cells: Uint8Array;
}

/** A level the stack reads: its surfaces, in order, and where it has a picture at all (the drawn levels below: their map's rect). */
export interface StackLevel {
  id: string;
  surfaces: readonly LevelSurface[];
  /** Only texels wholly inside this rect of world pixels have floor; unset, every texel has, unless a surface opens it. */
  pictured?: { width: number; height: number } | undefined;
}

/** A level's floor on `box`: 1 where it is open, 0 where it has floor, by its surfaces in order. */
function openCells(level: StackLevel, grid: StackGrid, box: TexelBox): Uint8Array {
  const open = new Uint8Array(box.columns * box.rows);
  if (level.pictured) {
    // A texel only partly on the level's map shows nothing of it.
    const columns = Math.floor(level.pictured.width / grid.texel + 1e-9);
    const rows = Math.floor(level.pictured.height / grid.texel + 1e-9);
    for (let row = 0; row < box.rows; row++) {
      for (let column = 0; column < box.columns; column++) {
        if (box.x + column >= columns || box.y + row >= rows) open[row * box.columns + column] = 1;
      }
    }
  }
  for (const surface of level.surfaces) {
    const area = polygonBox(surface.polygon, grid.texel, grid.columns, grid.rows);
    const overlap = area && intersect(area, box);
    if (!overlap) continue;
    const { inside, touched } = polygonTexels(surface.polygon, grid.texel, overlap);
    for (let row = 0; row < overlap.rows; row++) {
      const target = (overlap.y + row - box.y) * box.columns + overlap.x - box.x;
      for (let column = 0; column < overlap.columns; column++) {
        const i = row * overlap.columns + column;
        if (surface.open) {
          if (inside[i]) open[target + column] = 1;
        } else if (touched[i]) {
          open[target + column] = 0;
        }
      }
    }
  }
  return open;
}

function intersect(a: TexelBox, b: TexelBox): TexelBox | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.columns, b.x + b.columns);
  const bottom = Math.min(a.y + a.rows, b.y + b.rows);
  return right > x && bottom > y ? { x, y, columns: right - x, rows: bottom - y } : null;
}

/** The texels of the grid the viewed level's openings may open: the bounds of its open surfaces; null without one. */
function openingsBox(surfaces: readonly LevelSurface[], grid: StackGrid): TexelBox | null {
  let box: TexelBox | null = null;
  for (const surface of surfaces) {
    if (!surface.open) continue;
    const area = polygonBox(surface.polygon, grid.texel, grid.columns, grid.rows);
    if (!area) continue;
    if (!box) box = area;
    else {
      const x = Math.min(box.x, area.x);
      const y = Math.min(box.y, area.y);
      box = { x, y, columns: Math.max(box.x + box.columns, area.x + area.columns) - x, rows: Math.max(box.y + box.rows, area.y + area.rows) - y };
    }
  }
  return box;
}

/**
 * The stack of a view of `viewed`, whose levels below are `below`, nearest first. At each texel
 * the viewed level shows where it has floor; elsewhere the walk goes down to the first level with
 * floor there, which shows if it is one of `shown` (the levels below the view draws, and whose
 * picture is ready), and is VOID otherwise. Where no level below has floor (a chasm) it is VOID.
 */
export function levelStack(viewed: StackLevel, below: readonly StackLevel[], shown: readonly string[], grid: StackGrid): LevelStack {
  const levels = [viewed.id, ...shown];
  const openings = openingsBox(viewed.surfaces, grid);
  if (!openings) return { grid, levels, box: null, cells: new Uint8Array(0) };
  const own = openCells(viewed, grid, openings);
  const floors = below.map((level) => ({ open: openCells(level, grid, openings), index: shown.indexOf(level.id) }));
  const cells = new Uint8Array(own.length);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < own.length; i++) {
    if (!own[i]) continue;
    const floor = floors.find(({ open }) => !open[i]);
    cells[i] = floor && floor.index >= 0 ? floor.index + 1 : VOID;
    const column = i % openings.columns;
    const row = (i - column) / openings.columns;
    minX = Math.min(minX, column);
    minY = Math.min(minY, row);
    maxX = Math.max(maxX, column);
    maxY = Math.max(maxY, row);
  }
  if (minX === Infinity) return { grid, levels, box: null, cells: new Uint8Array(0) };
  // Cut to the texels that show anything but the viewed level.
  const box: TexelBox = { x: openings.x + minX, y: openings.y + minY, columns: maxX - minX + 1, rows: maxY - minY + 1 };
  const cut = new Uint8Array(box.columns * box.rows);
  for (let row = 0; row < box.rows; row++) {
    const from = (minY + row) * openings.columns + minX;
    cut.set(cells.subarray(from, from + box.columns), row * box.columns);
  }
  return { grid, levels, box, cells: cut };
}

/** What the stack shows at texel (`column`, `row`): an index into its levels, or VOID outside its grid. */
export function shownAtCell(stack: LevelStack, column: number, row: number): number {
  const { grid, box } = stack;
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return VOID;
  if (!box || column < box.x || row < box.y || column >= box.x + box.columns || row >= box.y + box.rows) return VIEWED;
  return stack.cells[(row - box.y) * box.columns + column - box.x]!;
}

/** What the stack shows at world point `p`: the texel holding it decides, as the picture's `texelFetch` does. */
export function shownAt(stack: LevelStack, p: Point): number {
  return shownAtCell(stack, Math.floor(p.x / stack.grid.texel), Math.floor(p.y / stack.grid.texel));
}

/** Whether the stack shows anything but the viewed level, and the level below at index `index` somewhere. */
export function showsBelow(stack: LevelStack, index: number): boolean {
  return stack.box !== null && stack.cells.includes(index);
}

/**
 * The levels below `viewed` that its view draws, nearest first: those the level sees (`sees`;
 * unset, every level below), at most `MAX_LEVELS_SHOWN_BELOW`.
 */
export function levelsShownBelow(levels: readonly SceneLevel[], viewed: string): string[] {
  const at = levels.findIndex((level) => level.id === viewed);
  if (at <= 0) return [];
  const sees = levels[at]!.sees;
  const shown: string[] = [];
  for (let index = at - 1; index >= 0 && shown.length < MAX_LEVELS_SHOWN_BELOW; index--) {
    const id = levels[index]!.id;
    if (!sees || sees.includes(id)) shown.push(id);
  }
  return shown;
}

/** The levels below `viewed`, nearest first. */
export function levelsBelow(levels: readonly SceneLevel[], viewed: string): SceneLevel[] {
  const at = levels.findIndex((level) => level.id === viewed);
  return at <= 0 ? [] : levels.slice(0, at).reverse();
}
