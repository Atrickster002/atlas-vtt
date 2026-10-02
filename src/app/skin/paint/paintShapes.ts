/**
 * The silhouettes of the paper skin: torn sheets and brushed ink, as SVG paths.
 *
 * Every shape is drawn in the element's own pixels, so a tear is as deep on a window as on a
 * menu, and a brush stroke as wide as the button it lies under. Sizes are put on a raster and
 * the seed picks one of a small stock of shapes: the browser reads and rasterises each distinct
 * mask image once, and a mask of its own for every element is what makes a painted page slow.
 */
export type PaintKind = 'sheet' | 'note' | 'key' | 'frame' | 'brush';

/** Whether the silhouette may reach past the element's box, or the element clips and it must stay inside. */
export type PaintFit = 'out' | 'in';

interface KindSpec {
  /** How far the paint layer reaches past the box on every side, in px. Holds the deepest swing and the ink line. */
  out: number;
  /** Deepest swing of the edge outwards, in px. `byHeight` makes it a share of the element's height instead, up to `ampMax` px. */
  amp: number;
  byHeight: boolean;
  ampMax: number;
  /** Distance between the points the edge is drawn through, in px (a share of the height where `byHeight`). */
  spacing: number;
  /** Brushed (curves) or torn (straight pieces). */
  smooth: boolean;
  /** Swing inwards as a share of the swing outwards. Ink runs out of a stamp, not into it. */
  inward: number;
  /** 1 spreads the swing evenly; more keeps most points near the edge and lets a few break out. */
  bias: number;
  /** Corner radius of the line the edge follows, as a share of half the short side. Torn paper has corners, ink has none. */
  corner: number;
  /** How far the ends of a stroke run thin, 0 to 1. */
  taper: number;
  /** Bend of the whole stroke as a share of its height, up to `bowMax` px: a hand draws no brush along a ruler. */
  bow: number;
  bowMax: number;
  /** How much thinner the end of a stroke is than its start, 0 to 1. */
  lead: number;
}

const SPECS: Record<PaintKind, KindSpec> = {
  sheet: { out: 12, amp: 9, byHeight: false, ampMax: 9, spacing: 30, smooth: false, inward: 0, bias: 1.35, corner: 0, taper: 0, bow: 0, bowMax: 0, lead: 0 },
  note: { out: 6, amp: 4, byHeight: false, ampMax: 4, spacing: 19, smooth: false, inward: 0, bias: 1.35, corner: 0, taper: 0, bow: 0, bowMax: 0, lead: 0 },
  // A box drawn by hand around a row or a card: nearly square corners, a line that wavers.
  frame: { out: 3, amp: 0.03, byHeight: true, ampMax: 1.3, spacing: 0.4, smooth: true, inward: 0.9, bias: 1.3, corner: 0.1, taper: 0, bow: 0, bowMax: 0, lead: 0 },
  key: { out: 4, amp: 0.045, byHeight: true, ampMax: 1.8, spacing: 0.27, smooth: true, inward: 0.6, bias: 1.7, corner: 0.42, taper: 0.16, bow: 0.017, bowMax: 0.8, lead: 0.5 },
  brush: { out: 8, amp: 0.085, byHeight: true, ampMax: 3.4, spacing: 0.27, smooth: true, inward: 0.5, bias: 1.7, corner: 0.35, taper: 0.34, bow: 0.05, bowMax: 2.2, lead: 0.6 },
};

/** How far a curve through the edge's points can swing past them, in px. */
const CURVE_SWING = 1;

/** Shapes per kind and size. More than this and neighbours of one size no longer repeat visibly; fewer masks would. */
export const SHAPE_POOL = 12;

/** How far a kind's paint layer reaches past its element, in px. */
export function paintOverhang(kind: PaintKind, fit: PaintFit = 'out'): number {
  return fit === 'in' ? 0 : SPECS[kind].out;
}

/** A length on the raster the shapes are made for: fine for controls, coarse for windows. */
export function sizeBucket(px: number): number {
  const step = px < 64 ? 4 : px < 256 ? 8 : px < 768 ? 24 : 64;
  return Math.max(step, Math.round(px / step) * step);
}

type Point = readonly [number, number];
interface EdgePoint { x: number; y: number; nx: number; ny: number }

/** A seeded random number in [0, 1): the same seed draws the same edge. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number for a text: equal texts paint equal shapes. */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** The line the edge follows: the box with rounded corners, as points with their outward normals, clockwise from the top left. */
function outline(width: number, height: number, radius: number, spacing: number, random: () => number, jitter: number): EdgePoint[] {
  const points: EdgePoint[] = [];
  const straight = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number): void => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const count = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + (random() - 0.5) * jitter) / count;
      points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx, ny });
    }
  };
  const corner = (cx: number, cy: number, from: number): void => {
    if (radius === 0) {
      const angle = from + Math.PI / 4;
      points.push({ x: cx, y: cy, nx: Math.cos(angle), ny: Math.sin(angle) });
      return;
    }
    const count = Math.max(2, Math.round((radius * Math.PI) / 2 / spacing));
    for (let i = 0; i < count; i++) {
      const angle = from + ((i + 0.5) / count) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, nx: Math.cos(angle), ny: Math.sin(angle) });
    }
  };
  straight(radius, 0, width - radius, 0, 0, -1);
  corner(width - radius, radius, -Math.PI / 2);
  straight(width, radius, width, height - radius, 1, 0);
  corner(width - radius, height - radius, 0);
  straight(width - radius, height, radius, height, 0, 1);
  corner(radius, height - radius, Math.PI / 2);
  straight(0, height - radius, 0, radius, -1, 0);
  corner(radius, radius, Math.PI);
  return points;
}

function edgePoints(spec: KindSpec, width: number, height: number, fit: PaintFit, random: () => number): Point[] {
  const scale = spec.byHeight ? height : 1;
  const amp = spec.byHeight ? Math.min(spec.ampMax, Math.max(0.9, spec.amp * scale)) : spec.amp;
  // Never far apart: a curve through few points swings wide of them.
  const spacing = spec.byHeight ? Math.min(22, Math.max(7, spec.spacing * scale)) : spec.spacing;
  const radius = spec.corner * (Math.min(width, height) / 2);
  const base = outline(width, height, radius, spacing, random, spec.smooth ? 0.25 : 0.7);
  const inward = fit === 'in' ? 1 : spec.inward;
  // A torn edge kept inside a box takes its depth from the box's padding, so there it is half as deep.
  const depthScale = fit === 'in' && !spec.smooth ? 0.5 : 1;
  let points = base.map(({ x, y, nx, ny }): Point => {
    const swing = random() * 2 - 1;
    const depth = (swing > 0 ? amp * swing ** spec.bias : -amp * inward * (-swing) ** spec.bias) * depthScale;
    // An element that clips keeps the whole edge inside its box, with room for the swing of a curve.
    const offset = fit === 'in' ? depth - amp * depthScale - CURVE_SWING : depth;
    return [x + nx * offset, y + ny * offset];
  });
  if (spec.taper > 0) {
    const middle = height / 2;
    // The start stays full, where the brush was set down; the end runs thin, where it was lifted.
    const profile = (t: number): number => {
      const u = Math.min(1, Math.max(0, t));
      return 1 - spec.taper + spec.taper * Math.min(1, Math.sin(Math.PI * u) ** 0.5 * (1 + spec.lead * (2 * u - 1)));
    };
    points = points.map(([x, y]): Point => [x, middle + (y - middle) * profile(x / width)]);
  }
  // A bow would carry the stroke out of a box that clips.
  if (spec.bow !== 0 && fit === 'out') {
    const bow = Math.min(spec.bowMax, spec.bow * height);
    points = points.map(([x, y]): Point => [x, y - bow * Math.sin(Math.PI * Math.min(1, Math.max(0, x / width)))]);
  }
  return points;
}

const round = (value: number): string => String(Math.round(value * 10) / 10);

/** A closed Catmull-Rom curve through the points, as cubic Bézier pieces. */
function curve(points: Point[]): string {
  const count = points.length;
  const at = (i: number): Point => points[((i % count) + count) % count]!;
  let path = `M${round(at(0)[0])} ${round(at(0)[1])}`;
  for (let i = 0; i < count; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    path += `C${round(p1[0] + (p2[0] - p0[0]) / 6)} ${round(p1[1] + (p2[1] - p0[1]) / 6)} ${round(p2[0] - (p3[0] - p1[0]) / 6)} ${round(p2[1] - (p3[1] - p1[1]) / 6)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return `${path}Z`;
}

function polygon(points: Point[]): string {
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;
}

export interface PaintGeometry {
  path: string;
  /** The box plus the overhang on every side: what the paint layer covers. */
  viewBox: string;
}

const geometries = new Map<string, PaintGeometry>();
const images = new Map<string, string>();

/** The silhouette for an element of this size. `seed` picks from the stock; sizes are put on the raster. */
export function paintGeometry(kind: PaintKind, seed: number, width: number, height: number, fit: PaintFit = 'out'): PaintGeometry {
  const w = sizeBucket(width);
  const h = sizeBucket(height);
  const shape = seed % SHAPE_POOL;
  const key = `${kind}:${fit}:${w}x${h}:${shape}`;
  const known = geometries.get(key);
  if (known) return known;
  const spec = SPECS[kind];
  const points = edgePoints(spec, w, h, fit, seededRandom(hashSeed(key)));
  const out = paintOverhang(kind, fit);
  const geometry = { path: spec.smooth ? curve(points) : polygon(points), viewBox: `${-out} ${-out} ${w + 2 * out} ${h + 2 * out}` };
  geometries.set(key, geometry);
  return geometry;
}

function image(key: string, viewBox: string, shape: string): string {
  const known = images.get(key);
  if (known) return known;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'>${shape}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  images.set(key, url);
  return url;
}

/** The filled silhouette as a mask image. */
export function paintMask(kind: PaintKind, seed: number, width: number, height: number, fit: PaintFit = 'out'): string {
  const { path, viewBox } = paintGeometry(kind, seed, width, height, fit);
  return image(`fill:${kind}:${fit}:${viewBox}:${seed % SHAPE_POOL}`, viewBox, `<path d='${path}'/>`);
}

/** The outline of the same silhouette as a mask image: the ink line that follows the tear point for point. */
export function paintStroke(kind: PaintKind, seed: number, width: number, height: number, fit: PaintFit = 'out'): string {
  const { path, viewBox } = paintGeometry(kind, seed, width, height, fit);
  return image(
    `line:${kind}:${fit}:${viewBox}:${seed % SHAPE_POOL}`,
    viewBox,
    `<path d='${path}' fill='none' stroke='black' stroke-width='1.15' stroke-linejoin='round' vector-effect='non-scaling-stroke'/>`,
  );
}

/** How many distinct mask images exist. Only tests read it: the stock must stay finite. */
export function paintImageCount(): number {
  return images.size;
}
