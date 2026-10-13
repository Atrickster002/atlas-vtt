import { Graphics } from 'pixi.js';
import type { CanvasBadgeColors } from './utils/canvasBadgeColors';

/** The mark's radius and where its centre sits on the badge's rim, as a share of the badge's radius. */
const MARK_RADIUS = 9;
const RIM = Math.SQRT1_2;

/**
 * The GM's sign that players may read a pin's note: a small disc on the badge's upper right in the
 * badge's ink, holding an open book in the badge's paper colour, so it reads on either theme.
 */
export function createReadableMark(badgeRadius: number, colors: CanvasBadgeColors): Graphics {
  const mark = new Graphics();
  mark.label = 'pin-readable-mark';
  mark.position.set(badgeRadius * RIM, -badgeRadius * RIM);
  mark.circle(0, 0, MARK_RADIUS).fill({ color: colors.stroke });
  mark.circle(0, 0, MARK_RADIUS).stroke({ width: 1.5, color: colors.background });
  // Two pages meeting at the spine, each a little higher at its outer edge.
  mark.poly([-0.7, -2.8, -5.6, -4.2, -5.6, 3.4, -0.7, 4.6]).fill({ color: colors.background });
  mark.poly([0.7, -2.8, 5.6, -4.2, 5.6, 3.4, 0.7, 4.6]).fill({ color: colors.background });
  return mark;
}
