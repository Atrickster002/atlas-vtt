/**
 * The faces of the dice: cut from card stock and lettered in pencil.
 *
 * A computed wood grain used to live here: fractal growth rings in the albedo,
 * the same strokes as grooves in the relief, numerals from `fillText` in gold
 * with a darker rim. It looked expensive and was the only thing on the sheet
 * that came out of a drawing program; next to it every glyph, every card and
 * the title itself is a pencil stroke.
 *
 * Both now come baked (`tools/pencil-die-faces.mjs` in the original project):
 * the numerals as drawings on the same net as everything else, the ground as a
 * cut from the same paper layer that lies under the whole sheet. The only thing
 * computed here is **which numeral goes into which cell**.
 *
 * The images arrive later: until they do, the body shows the bare card tone,
 * and `refreshDieArtwork` redraws the faces.
 */

import * as THREE from 'three';

import CARD_URL from '../assets/dice3d/card.webp?inline';
import NUMERALS_URL from '../assets/dice3d/numerals.webp?inline';
import { dieGeometry, faceIndexForValue, type DieSides } from './dieGeometry';
import { faceOutline } from './faceFrame';
import { placeNumeral, type InkBox, type NumeralPlacement } from './numeralPlacement';

/** Edge length of an atlas cell in pixels. */
export const CELL = 256;

const SHEET_CELL = 160;
const SHEET_COLS = 6;
/**
 * How much of its cell the drawn numeral itself fills (`HEIGHT / CELL` in the
 * baking tool). From it follows how large the cell has to land on the face for
 * the numeral to get the requested height.
 */
const SHEET_FILL = 0.6;
/** The card tone while the paper image has not arrived yet. */
const CARD = '#a98f66';

/** Cells in the numeral sheet: 1 to 20, then the underlined 6 and 9. */
const SHEET_NUMERALS = 22;
/** Alpha above which a sheet pixel counts as ink. */
const INK_ALPHA = 40;
/** Assumed ink while the sheet cannot be measured: the drawn height, as wide as tall, centred. */
const NOMINAL_INK: InkBox = {
  x0: SHEET_CELL * (1 - SHEET_FILL) / 2,
  y0: SHEET_CELL * (1 - SHEET_FILL) / 2,
  x1: SHEET_CELL * (1 + SHEET_FILL) / 2,
  y1: SHEET_CELL * (1 + SHEET_FILL) / 2,
};

let numeralSheet: HTMLImageElement | null = null;
/** Ink bounds per sheet cell, measured once the sheet has loaded. */
let numeralInk: InkBox[] | null = null;
const placements = new Map<string, NumeralPlacement>();
let cardStock: HTMLImageElement | null = null;
let artworkPending: Promise<void> | null = null;

/** Small seeded random generator: same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One atlas cell per face plus a blank one for chamfers and corners. */
export function atlasLayout(sides: DieSides): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(sides + 1));
  return { cols, rows: Math.ceil((sides + 1) / cols) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('Dice artwork failed to load'));
    img.src = url;
  });
}

/**
 * Fetches the numeral sheet and the card stock, once, in the background. If
 * it fails the die stays a piece of card without numbers: ugly, but it does not
 * hold up the throw.
 */
export function loadDiceArtwork(): Promise<void> {
  artworkPending ??= Promise.all([loadImage(NUMERALS_URL), loadImage(CARD_URL)])
    .then(([sheet, card]) => {
      numeralSheet = sheet;
      numeralInk = measureInk(sheet);
      placements.clear();
      cardStock = card;
    })
    .catch(() => undefined);
  return artworkPending;
}

/** The ink bounds of every numeral in the sheet; null where the canvas cannot be read. */
function measureInk(sheet: HTMLImageElement): InkBox[] | null {
  const canvas = createEl('canvas');
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(sheet, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, sheet.width, sheet.height);
  return Array.from({ length: SHEET_NUMERALS }, (_, cell): InkBox => {
    const left = (cell % SHEET_COLS) * SHEET_CELL;
    const top = Math.floor(cell / SHEET_COLS) * SHEET_CELL;
    const box = { x0: SHEET_CELL, y0: SHEET_CELL, x1: 0, y1: 0 };
    for (let y = 0; y < SHEET_CELL; y++) {
      for (let x = 0; x < SHEET_CELL; x++) {
        if (data[((top + y) * width + left + x) * 4 + 3]! <= INK_ALPHA) continue;
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x + 1);
        box.y1 = Math.max(box.y1, y + 1);
      }
    }
    return box.x1 > box.x0 ? box : NOMINAL_INK;
  });
}

/** Font size of the numeral per body: many faces means little room. */
export function numeralSize(sides: DieSides): number {
  if (sides === 4) return CELL * 0.34;
  if (sides >= 12) return CELL * 0.36;
  return CELL * 0.44;
}

/** The 6 and the 9 carry an underline where both occur on the body. */
export function needsUnderline(sides: DieSides, value: number): boolean {
  return sides >= 10 && (value === 6 || value === 9);
}

/** Which cell of the sheet carries this number; underlined 6 and 9 sit at the end. */
export function numeralCell(sides: DieSides, value: number): number {
  if (needsUnderline(sides, value)) return value === 6 ? 20 : 21;
  return value - 1;
}

/**
 * Paints the numerals of a body into a drawing atlas. `paint` gets the cell
 * centre in pixels per face and paints ground and numeral; the last cell stays
 * the blank ground for chamfers and corners.
 */
export function drawAtlas(
  sides: DieSides,
  paint: (ctx: CanvasRenderingContext2D, cell: { x: number; y: number; value: number | null }) => void,
): HTMLCanvasElement {
  const { cols, rows } = atlasLayout(sides);
  const canvas = createEl('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;
  const values = dieGeometry(sides).values;
  for (let i = 0; i <= sides; i++) {
    const x = (i % cols) * CELL + CELL / 2;
    const y = Math.floor(i / cols) * CELL + CELL / 2;
    ctx.save();
    paint(ctx, { x, y, value: i < sides ? values[i]! : null });
    ctx.restore();
  }
  return canvas;
}

/**
 * The ground of a face: a cut from the card stock, taken from a different spot
 * per cell. The same cut on twenty faces would look stamped, precisely when
 * the die turns.
 */
export function paintCard(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  ctx.fillStyle = CARD;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  if (cardStock === null) return;
  const random = seededRandom(seed);
  const sx = random() * Math.max(1, cardStock.width - CELL);
  const sy = random() * Math.max(1, cardStock.height - CELL);
  ctx.drawImage(cardStock, sx, sy, CELL, CELL, x - CELL / 2, y - CELL / 2, CELL, CELL);
}

/**
 * **The worn rim.**
 *
 * A die that spent a long time in a bag is darker at the edges than in the
 * face: that is where the hand grips and where it knocks against its
 * neighbours. Without this gradient every face is evenly bright and the body
 * looks freshly pressed: clean, and therefore wrong.
 *
 * The cell is darkened radially, and that fits the face although it is a
 * triangle or pentagon: the polygon sits centred in its cell, so its rim lies
 * wherever the gradient turns dark. The last cell (chamfers and corners) gets
 * more of it than the faces, because the edges are what gets knocked.
 */
export function paintWear(ctx: CanvasRenderingContext2D, x: number, y: number, edge: boolean): void {
  const g = ctx.createRadialGradient(x, y, CELL * 0.2, x, y, CELL * 0.62);
  g.addColorStop(0, 'rgb(58 38 20 / 0)');
  g.addColorStop(0.6, `rgb(58 38 20 / ${edge ? 0.22 : 0.1})`);
  g.addColorStop(1, `rgb(44 28 14 / ${edge ? 0.62 : 0.4})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
}

/** Size and position of a numeral on its face; see `numeralPlacement.ts`. */
function placementFor(sides: DieSides, value: number, ink: InkBox, pxPerSheetPx: number): NumeralPlacement {
  const key = `${sides}:${value}`;
  let placement = placements.get(key);
  if (!placement) {
    const geometry = dieGeometry(sides);
    const outline = faceOutline(geometry, faceIndexForValue(geometry, value), CELL);
    placement = placeNumeral(outline, (ink.x1 - ink.x0) * pxPerSheetPx, (ink.y1 - ink.y0) * pxPerSheetPx);
    placements.set(key, placement);
  }
  return placement;
}

/** The drawn numeral from the sheet, its ink fitted into the face. */
export function paintNumeral(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sides: DieSides,
  value: number,
): void {
  if (numeralSheet === null) return;
  const i = numeralCell(sides, value);
  const ink = numeralInk?.[i] ?? NOMINAL_INK;
  const pxPerSheetPx = numeralSize(sides) / SHEET_FILL / SHEET_CELL;
  const { scale, shift } = placementFor(sides, value, ink, pxPerSheetPx);
  const k = pxPerSheetPx * scale;
  // The ink centre lands on the face centre, moved `shift` towards the numeral's top (up the canvas).
  ctx.drawImage(
    numeralSheet,
    (i % SHEET_COLS) * SHEET_CELL,
    Math.floor(i / SHEET_COLS) * SHEET_CELL,
    SHEET_CELL,
    SHEET_CELL,
    x - ((ink.x0 + ink.x1) / 2) * k,
    y - shift - ((ink.y0 + ink.y1) / 2) * k,
    SHEET_CELL * k,
    SHEET_CELL * k,
  );
}

export interface DieTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  redraw: () => void;
}

/**
 * The atlas of a body: one cell per face holding card and numeral. The last
 * cell stays bare card; it carries the chamfers and corners.
 *
 * Plus a relief. It comes from **the same two images**: the paper's grain is
 * the tooth, and where graphite lies it lies *in* the tooth, a touch deeper.
 * Randomised separately, the relief would look like scratches on a photo of
 * paper.
 */
export function buildTextures(sides: DieSides): DieTextures {
  const albedo = (): HTMLCanvasElement =>
    drawAtlas(sides, (ctx, { x, y, value }) => {
      paintCard(ctx, x, y, sides * 31 + (value ?? 0) * 7 + 5);
      paintWear(ctx, x, y, value === null);
      if (value !== null) paintNumeral(ctx, x, y, sides, value);
    });

  const bump = (): HTMLCanvasElement =>
    drawAtlas(sides, (ctx, { x, y, value }) => {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.filter = 'grayscale(1) contrast(2.1)';
      paintCard(ctx, x, y, sides * 31 + (value ?? 0) * 7 + 5);
      ctx.restore();
      if (value === null) return;
      ctx.save();
      ctx.globalAlpha = 0.7;
      paintNumeral(ctx, x, y, sides, value);
      ctx.restore();
    });

  const textures = {
    map: new THREE.CanvasTexture(albedo()),
    bumpMap: new THREE.CanvasTexture(bump()),
  };
  textures.map.colorSpace = THREE.SRGBColorSpace;
  for (const tex of Object.values(textures)) tex.anisotropy = 4;

  return {
    ...textures,
    redraw: (): void => {
      textures.map.image = albedo();
      textures.bumpMap.image = bump();
      for (const tex of Object.values(textures)) tex.needsUpdate = true;
    },
  };
}
