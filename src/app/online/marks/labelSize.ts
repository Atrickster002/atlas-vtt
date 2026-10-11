import { measureLabelFontSize } from '../../pixi/utils/measureDrawing';

/** The smallest a ruler's label is on screen, in CSS pixels: the size Atlas's label has at zoom 1. */
export const MIN_LABEL_PX = 16;

/**
 * A ruler label's font size in world units: Atlas's (`measureLabelFontSize`), but never smaller on
 * screen than `MIN_LABEL_PX`. Atlas caps the label at 32 world units, which below zoom 0.5 shrinks it
 * to dots; a player's view, fitted to the whole map, mostly sits there.
 */
export function readableLabelFontSize(viewportScale: number): number {
  return Math.max(measureLabelFontSize(viewportScale), MIN_LABEL_PX / (viewportScale || 1));
}
