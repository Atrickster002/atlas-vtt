/**
 * Colour-vision simulation for tests: how a colour looks with full protanopia,
 * deuteranopia or tritanopia (Machado, Oliveira & Fernandes 2009), and how far apart
 * two colours look (CIEDE2000; below about 10 they are easily mistaken for each other).
 */

export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export const COLOR_VISIONS: readonly ColorVision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];

type Matrix = readonly [readonly number[], readonly number[], readonly number[]];

const DEFICIENCIES: Record<Exclude<ColorVision, 'normal'>, Matrix> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

type Lab = [number, number, number];

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIELAB of a `#rrggbb` colour as seen with `vision`. */
export function seenAs(hex: string, vision: ColorVision): Lab {
  const rgb = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16)));
  const [r, g, b] = vision === 'normal'
    ? rgb
    : DEFICIENCIES[vision].map((row) => Math.min(1, Math.max(0, row[0]! * rgb[0]! + row[1]! * rgb[1]! + row[2]! * rgb[2]!)));
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047;
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/** CIEDE2000 colour difference. */
export function colorDifference([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const [a1p, a2p] = [a1 * (1 + g), a2 * (1 + g)];
  const [c1, c2] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (a: number, b: number): number => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const [h1, h2] = [hue(a1p, b1), hue(a2p, b2)];
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dHue = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2));
  const lBar = (l1 + l2) / 2;
  const cBarP = (c1 + c2) / 2;
  let hBar = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
  if (c1 * c2 === 0) hBar = h1 + h2;
  const t = 1 - 0.17 * Math.cos(rad(hBar - 30)) + 0.24 * Math.cos(rad(2 * hBar)) + 0.32 * Math.cos(rad(3 * hBar + 6)) - 0.2 * Math.cos(rad(4 * hBar - 63));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hBar - 275) / 25) ** 2))));
  const [dl, dc, dhs] = [(l2 - l1) / sl, (c2 - c1) / sc, dHue / sh];
  return Math.sqrt(dl ** 2 + dc ** 2 + dhs ** 2 + rt * dc * dhs);
}
