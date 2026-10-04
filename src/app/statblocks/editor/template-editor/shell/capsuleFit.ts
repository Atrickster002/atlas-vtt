/**
 * How the template editor's header capsule fits its width without wrapping
 * (§2.3): it must stay as tall as the note view's, so the card starts at the
 * same height. Parts give way in a fixed order; the name truncates last.
 * Pure: the capsule measures, this decides.
 */

/** Natural widths in CSS pixels; 0 for a part the capsule does not have. */
export interface CapsuleWidths {
  /** The capsule's inner width (without its padding). */
  available: number;
  gap: number;
  /** The collection chip. */
  chip: number;
  /** What the name keeps at least before it truncates. */
  nameMin: number;
  /** The muted "template · 3 statblocks" or "built in". */
  count: number;
  /** "Show with: Aboleth ▾" in words, and as an icon button. */
  showWith: number;
  showWithIcon: number;
  /** The ⋯ button. */
  more: number;
}

export interface CapsuleFit {
  /** Show with becomes an icon button whose value is in its tooltip. */
  showWithIcon: boolean;
  /** The count moves into the ⋯ menu. */
  countFolded: boolean;
  /** The collection chip moves into the ⋯ menu. */
  chipFolded: boolean;
}

export const CAPSULE_FULL: CapsuleFit = { showWithIcon: false, countFolded: false, chipFolded: false };

/** The steps in the order they are taken; each keeps the ones before it. */
const STEPS: readonly CapsuleFit[] = [
  CAPSULE_FULL,
  { showWithIcon: true, countFolded: false, chipFolded: false },
  { showWithIcon: true, countFolded: true, chipFolded: false },
  { showWithIcon: true, countFolded: true, chipFolded: true },
];

/** The width the capsule's parts take at a step, gaps included. */
export function capsuleWidthAt(widths: CapsuleWidths, fit: CapsuleFit): number {
  const parts = [
    fit.chipFolded ? 0 : widths.chip,
    widths.nameMin,
    fit.countFolded ? 0 : widths.count,
    fit.showWithIcon ? widths.showWithIcon : widths.showWith,
    widths.more,
  ].filter((width) => width > 0);
  return parts.reduce((sum, width) => sum + width, 0) + widths.gap * Math.max(0, parts.length - 1);
}

/** The first step at which every part fits; the last step when none does (the name then truncates further). */
export function capsuleFit(widths: CapsuleWidths): CapsuleFit {
  return STEPS.find((step) => capsuleWidthAt(widths, step) <= widths.available) ?? STEPS[STEPS.length - 1]!;
}
