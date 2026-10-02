/**
 * The silhouettes of the paper skin: torn paper and brushed ink, as SVG paths. The generator
 * is Armarium's (`kit/paint-shapes.ts`), so a plate or a sheet here is the same shape there.
 *
 * Every variant comes from one generator, so filled and outlined elements share a hand. A
 * shape is drawn in a box `VIEW_H` units high and stretched over its element. The seed picks
 * from a small stock of shapes: the browser reads and rasterises each distinct mask image
 * once, and a mask of its own for every element is what makes a painted page slow.
 */
export type PaintVariant =
  | 'brush-plate'
  | 'key-plate'
  | 'torn-plate'
  | 'torn-note'
  | 'torn-leaf'
  | 'torn-sheet'
  | 'torn-window'
  | 'blotch'
  | 'pebble'
  | 'wash';

/** Height of the drawing box of a control; its width follows the element. */
export const VIEW_H = 64;
/** The ratio a shape is drawn for is clamped to this range. */
const RATIO_RANGE = { min: 0.6, max: 12 };
/** Ratios are put on a raster, or every pixel width would have a mask of its own. */
const RATIO_STEP = 0.5;
/**
 * A tall element gets a taller drawing box, in steps of this many units, so that a unit is
 * never more than `MAX_UNIT_PX` on screen: a tear is a share of the box's height, and on a
 * window 900 px high the tear of a 64-unit box would be 15 px deep.
 */
const HEIGHT_STEP = 32;
const MAX_UNIT_PX = 4.5;

interface VariantSpec {
  /** Swing of the edge outwards, in units. */
  amp: number;
  /** Distance between the points the edge is drawn through, in units. */
  spacing: number;
  /** Brushed (curves) or torn (straight pieces). */
  smooth: boolean;
  /** How far the short ends run thin, 0 to 1: a stroke that tapers off. */
  taper: number;
  /** 1 spreads the swing evenly; more keeps most points near the edge and lets a few break out. */
  bias: number;
  /** Swing inwards as a share of the swing outwards. Ink runs out of a stamp, not into it. */
  inward: number;
  /** Corner radius of the line the edge follows, as a share of half the short side. Torn paper has corners, ink has none. */
  corner: number;
  /** Splashes pulled outwards. */
  splashes: number;
  /** Bend of the whole stroke, in units: a hand draws no brush along a ruler. */
  bow: number;
  /** How much thinner the end of a stroke is than its start, 0 to 1. */
  lead: number;
}

const SPECS: Record<PaintVariant, VariantSpec> = {
  'brush-plate': { amp: 5.2, spacing: 17, smooth: true, taper: 0.34, bias: 1.7, inward: 0.5, corner: 0.35, splashes: 0, bow: 3.2, lead: 0.6 },
  'key-plate': { amp: 1.9, spacing: 17, smooth: true, taper: 0.16, bias: 1.7, inward: 0.6, corner: 0.42, splashes: 0, bow: 1.1, lead: 0.5 },
  'torn-plate': { amp: 3.9, spacing: 14, smooth: false, taper: 0, bias: 1, inward: 1, corner: 0, splashes: 0, bow: 0, lead: 0 },
  'torn-note': { amp: 2.1, spacing: 11, smooth: false, taper: 0, bias: 1.35, inward: 0.85, corner: 0.06, splashes: 0, bow: 0, lead: 0 },
  'torn-leaf': { amp: 0.62, spacing: 2.5, smooth: false, taper: 0, bias: 1.6, inward: 0.7, corner: 0.1, splashes: 0, bow: 0, lead: 0 },
  'torn-sheet': { amp: 1.1, spacing: 2.5, smooth: false, taper: 0, bias: 1.35, inward: 0.8, corner: 0.12, splashes: 0, bow: 0, lead: 0 },
  // Atlas' own: a sheet whose content paints up to its edge (a side column, a footer band).
  // It tears outwards only and keeps its corners, so nothing that lies on it sticks out.
  'torn-window': { amp: 1.1, spacing: 2.5, smooth: false, taper: 0, bias: 1.35, inward: 0, corner: 0, splashes: 0, bow: 0, lead: 0 },
  blotch: { amp: 10, spacing: 18, smooth: true, taper: 0.05, bias: 1.15, inward: 0.3, corner: 0.62, splashes: 3, bow: 0, lead: 0 },
  pebble: { amp: 4, spacing: 13, smooth: true, taper: 0, bias: 1, inward: 0.6, corner: 0.9, splashes: 0, bow: 0, lead: 0 },
  wash: { amp: 2.6, spacing: 15, smooth: true, taper: 0, bias: 1.15, inward: 0.9, corner: 0.5, splashes: 0, bow: 0, lead: 0 },
};

/** Which variants carry the bristle of a dry brush in their mask. Paper is torn, not painted, and a key must not show holes. */
const BRISTLED: ReadonlySet<PaintVariant> = new Set(['brush-plate', 'torn-plate', 'blotch']);

export function hasBristle(variant: PaintVariant): boolean {
  return BRISTLED.has(variant);
}

const SPLASH_REACH = { min: 0.5, max: 1.3 };
const SPLASH_SPREAD = 0.55;
/** A swing outwards is flattened towards `hard`, so no point leaves the paint layer. */
const OUTWARD_CAP = { soft: 10, hard: 15 };
/** Room around the shape for the ink line. */
const STROKE_PAD = 1.5;
/** Shapes per variant and box. Neighbours of one size repeat only every sixteenth time. */
export const SHAPE_POOL = 16;

function capOutward(reach: number): number {
  const { soft, hard } = OUTWARD_CAP;
  if (reach <= soft) return reach;
  return soft + (hard - soft) * (1 - Math.exp(-(reach - soft) / (hard - soft)));
}

/** A number for a text: equal texts paint equal shapes. */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = readonly [number, number];
interface Sample { x: number; y: number; nx: number; ny: number }

const round = (value: number): number => Math.round(value * 10) / 10;

/** The line the edge follows: the box with rounded corners, as points with their outward normals. */
function walkBaseline(width: number, height: number, corner: number, spacing: number): Sample[] {
  const radius = Math.min(width, height) * 0.5 * corner;
  const samples: Sample[] = [];
  const straight = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
    const count = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let i = 0; i < count; i++) {
      const t = i / count;
      samples.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny });
    }
  };
  const arc = (cx: number, cy: number, from: number): void => {
    if (radius < 0.5) return;
    const count = Math.max(3, Math.round((radius * Math.PI) / 2 / spacing));
    for (let i = 0; i < count; i++) {
      const angle = from + (Math.PI / 2) * (i / count);
      samples.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), nx: Math.cos(angle), ny: Math.sin(angle) });
    }
  };
  straight(radius, 0, width - radius, 0, 0, -1);
  arc(width - radius, radius, -Math.PI / 2);
  straight(width, radius, width, height - radius, 1, 0);
  arc(width - radius, height - radius, 0);
  straight(width - radius, height, radius, height, 0, 1);
  arc(radius, height - radius, Math.PI / 2);
  straight(0, height - radius, 0, radius, -1, 0);
  arc(radius, radius, Math.PI);
  return samples;
}

function buildPoints(spec: VariantSpec, seed: number, width: number, height: number): Point[] {
  const random = mulberry32(seed);
  const cx = width / 2;
  const cy = height / 2;
  const wobble = (): number => {
    const signed = random() * 2 - 1;
    const reach = Math.abs(signed) ** spec.bias * spec.amp;
    return signed >= 0 ? reach : -reach * spec.inward;
  };
  // A sheet that tears outwards only does not drift along its edge either: at a corner the
  // drift along one side is a step into the box on the other.
  const driftAmp = spec.inward === 0 ? 0 : spec.amp * 0.3;
  const drift = (): number => (random() * 2 - 1) * driftAmp;
  const bases = walkBaseline(width, height, spec.corner, spec.spacing);
  let points = bases.map(({ x, y, nx, ny }): Point => {
    const out = wobble();
    const along = drift();
    return [x + nx * out - ny * along, y + ny * out + nx * along];
  });

  for (let i = 0; i < spec.splashes; i++) {
    const index = Math.floor(random() * points.length);
    const reach = spec.amp * (SPLASH_REACH.min + random() * (SPLASH_REACH.max - SPLASH_REACH.min));
    const origin = points[index]!;
    const nx = (origin[0] - cx) / cx;
    const ny = (origin[1] - cy) / cy;
    const length = Math.hypot(nx, ny) || 1;
    const moved = [...points];
    for (const [offset, share] of [[0, 1], [-1, SPLASH_SPREAD], [1, SPLASH_SPREAD]] as const) {
      const j = (index + offset + points.length) % points.length;
      const point = moved[j]!;
      moved[j] = [point[0] + (nx / length) * reach * share, point[1] + (ny / length) * reach * share];
    }
    points = moved;
  }

  // Cap the peaks against the baseline, so the swing and the splashes stay under the lid together.
  points = points.map((point, i): Point => {
    const { x, y, nx, ny } = bases[i]!;
    const out = (point[0] - x) * nx + (point[1] - y) * ny;
    const capped = capOutward(out);
    return capped === out ? point : [point[0] + nx * (capped - out), point[1] + ny * (capped - out)];
  });

  if (spec.taper > 0) {
    // The start stays nearly full, where the brush was set down; the end runs thin, where it
    // was lifted. Equal ends are the surest sign that no one drew the stroke.
    const profile = (t: number): number => {
      const u = Math.min(1, Math.max(0, t));
      const symmetric = Math.sin(Math.PI * u) ** 0.5;
      const skew = 1 + spec.lead * (2 * u - 1);
      return 1 - spec.taper + spec.taper * Math.min(1, symmetric * skew);
    };
    points = points.map(([x, y]): Point => [x, cy + (y - cy) * profile(x / width)]);
  }

  // The bow last: it moves the finished stroke across, instead of shaping it.
  if (spec.bow !== 0) {
    points = points.map(([x, y]): Point => [x, y - spec.bow * Math.sin(Math.PI * Math.min(1, Math.max(0, x / width)))]);
  }
  return points;
}

/** A closed Catmull-Rom curve through the points, as cubic Bézier pieces (two control points and the end). */
function smoothSegments(points: Point[]): Point[][] {
  const n = points.length;
  const at = (i: number): Point => points[((i % n) + n) % n]!;
  return points.map((p1, i) => {
    const p0 = at(i - 1);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    return [
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ];
  });
}

export interface PaintGeometry {
  path: string;
  viewBox: string;
  /**
   * The `inset` of the paint layer: negative percentages that pull it past the element's
   * box by exactly what the shape reaches out, each side on its own (top, right, bottom,
   * left). Percentages, so the silhouette sits right whatever the element's size.
   */
  inset: string;
}

/** The drawing box for an element of this size: `VIEW_H` high for a control, taller for a panel. */
export function drawingBox(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: Math.round((200 / 64) * VIEW_H), height: VIEW_H };
  const units = Math.max(VIEW_H, Math.ceil(height / MAX_UNIT_PX / HEIGHT_STEP) * HEIGHT_STEP);
  const ratio = Math.min(RATIO_RANGE.max, Math.max(RATIO_RANGE.min, Math.round(width / height / RATIO_STEP) * RATIO_STEP));
  return { width: Math.round(ratio * units), height: units };
}

const geometries = new Map<string, PaintGeometry>();
const images = new Map<string, string>();

/** The silhouette for an element of this size, in px. `seed` picks from the stock. */
export function paintGeometry(variant: PaintVariant, seed: number, width: number, height: number): PaintGeometry {
  const box = drawingBox(width, height);
  const form = ((seed % SHAPE_POOL) + SHAPE_POOL) % SHAPE_POOL;
  const key = `${variant}:${form}:${box.width}x${box.height}`;
  const known = geometries.get(key);
  if (known) return known;

  const spec = SPECS[variant];
  const points = buildPoints(spec, form, box.width, box.height);
  const segments = spec.smooth ? smoothSegments(points) : [];
  const pair = ([x, y]: Point): string => `${round(x)} ${round(y)}`;
  const path = spec.smooth
    ? `M${pair(points[0]!)}${segments.map((segment) => `C${segment.map(pair).join(',')}`).join('')}Z`
    : `M${points.map(pair).join('L')}Z`;
  const hull = [...points, ...segments.flat()];
  const xs = hull.map(([x]) => x);
  const ys = hull.map(([, y]) => y);
  const minX = Math.min(...xs) - STROKE_PAD;
  const maxX = Math.max(...xs) + STROKE_PAD;
  const minY = Math.min(...ys) - STROKE_PAD;
  const maxY = Math.max(...ys) + STROKE_PAD;
  const percent = (gap: number, extent: number): string => `${((-gap / extent) * 100).toFixed(2)}%`;
  const geometry: PaintGeometry = {
    path,
    viewBox: `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`,
    inset: [percent(-minY, box.height), percent(maxX - box.width, box.width), percent(maxY - box.height, box.height), percent(-minX, box.width)].join(' '),
  };
  geometries.set(key, geometry);
  return geometry;
}

function image(kind: string, variant: PaintVariant, seed: number, width: number, height: number, shape: (path: string) => string): string {
  const box = drawingBox(width, height);
  const key = `${kind}:${variant}:${((seed % SHAPE_POOL) + SHAPE_POOL) % SHAPE_POOL}:${box.width}x${box.height}`;
  const known = images.get(key);
  if (known) return known;
  const { path, viewBox } = paintGeometry(variant, seed, width, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none">${shape(path)}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  images.set(key, url);
  return url;
}

/** The filled silhouette as a mask image. */
export function paintMask(variant: PaintVariant, seed: number, width: number, height: number): string {
  return image('fill', variant, seed, width, height, (path) => `<path d="${path}" fill="#fff"/>`);
}

/** The outline of the same silhouette as a mask image: the ink line that follows the tear point for point. */
export function paintStroke(variant: PaintVariant, seed: number, width: number, height: number): string {
  return image('line', variant, seed, width, height, (path) =>
    `<path d="${path}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`);
}

/** Where the bristle field lies under an element, so two plates never show the same streaks. */
export function bristleOffset(seed: number, size = 160): string {
  return `${(seed % size) - size / 2}px ${((seed >>> 8) % size) - size / 2}px`;
}

/** How many distinct mask images exist. Only tests read it: the stock must stay finite. */
export function paintImageCount(): number {
  return images.size;
}
