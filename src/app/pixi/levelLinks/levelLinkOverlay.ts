import type { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { linkHeading } from '../../levels/levelLinks';
import type { LevelLink } from '../../types/sceneLevelTypes';
import type { Point } from '../../types/visionTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaOverlay } from '../areas/PolygonAreaOverlay';
import { MAP_LAYER_Z } from '../mapLayerOrder';

/** Which way stairs lead from the level shown (`linkHeading`). */
export type StairsHeading = ReturnType<typeof linkHeading>;

/** How strongly stairs show while the stairs tool is not in use. */
const RESTING_ALPHA = 0.55;

/** The stairs tool's icon (`StairsIcon`), in screen pixels about the badge's middle. */
const STEPS: readonly [number, number][] = [[3, 20], [8, 20], [8, 15], [13, 15], [13, 10], [18, 10], [18, 5], [21, 5]].map(([x, y]) => [(x! - 12) * 0.55, (y! - 12.5) * 0.55]);

function drawSteps(g: Graphics, at: Point, pixel: number, color: number, alpha: number): void {
  STEPS.forEach(([x, y], index) => (index === 0 ? g.moveTo(at.x + x * pixel, at.y + y * pixel) : g.lineTo(at.x + x * pixel, at.y + y * pixel)));
  g.stroke({ width: 1.6 * pixel, color, alpha, cap: 'round', join: 'round' });
}

/** An arrow up (`dir` -1) or down (1) through the badge's middle, in screen pixels. */
function drawArrow(g: Graphics, at: Point, pixel: number, dir: 1 | -1, color: number, alpha: number): void {
  const tip = { x: at.x, y: at.y + 5 * dir * pixel };
  g.moveTo(at.x, at.y - 5 * dir * pixel).lineTo(tip.x, tip.y);
  g.moveTo(tip.x - 3.5 * pixel, tip.y - 3.5 * dir * pixel).lineTo(tip.x, tip.y).lineTo(tip.x + 3.5 * pixel, tip.y - 3.5 * dir * pixel);
  g.stroke({ width: 1.6 * pixel, color, alpha, cap: 'round', join: 'round' });
}

/**
 * The stairs of the level shown (`PolygonAreaOverlay`): their outlines with a badge that shows steps
 * where they lead both ways, an arrow where they lead only up or only down, and faint steps where
 * they lead nowhere from this level. Shown to the GM at rest too, faintly, so the GM knows where a
 * drop changes a token's level; the corners only with the stairs tool. Never in the players' view
 * or a picture of the scene (the GM's markers).
 */
export function levelLinkOverlay(viewport: Viewport, headingOf: (link: LevelLink) => StairsHeading): PolygonAreaOverlay<LevelLink> {
  return new PolygonAreaOverlay<LevelLink>(viewport, {
    label: 'level-links',
    zIndex: MAP_LAYER_Z.levelLinks,
    restingAlpha: RESTING_ALPHA,
    handleOf: (link) => areaHandlePoint(link.polygon),
    decorate: (g, link, { at, pixel, theme, alpha }) => {
      const heading = headingOf(link);
      if (heading === 'up' || heading === 'down') drawArrow(g, at, pixel, heading === 'up' ? -1 : 1, theme.stroke, alpha);
      else drawSteps(g, at, pixel, theme.stroke, heading === 'none' ? alpha * 0.4 : alpha);
    },
  });
}
