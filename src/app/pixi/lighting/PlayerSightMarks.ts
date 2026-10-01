import { Container, Graphics } from 'pixi.js';
import { EYE_OFF_SVG } from '../token-renderer/HiddenTokenIcon';
import { canvasBadgeColors, type CanvasBadgeColors } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import type { SightMark } from './sightMarks';

/** UI units (a medium token on a 70 px grid is 62 across): a small badge on the token's edge. */
export const SIGHT_MARK_RADIUS = 11;
const GLYPH_SIZE = 15;

interface Badge {
  view: Container;
  kind: SightMark['kind'];
  /** The colour of the theme it was drawn in. */
  background: number;
}

/**
 * The GM's marks on tokens the players do not see now: a small badge in the pins' language on
 * the token's edge, an eye struck through for a token they do not perceive, a dashed circle for
 * one they only sense (its outline is all they get). The badges take the theme's colours and
 * scale like token UI. Part of the GM's sight aids (`GmSightAids`).
 */
export class PlayerSightMarks {
  readonly view = new Container({ label: 'player-sight-marks', eventMode: 'none', interactiveChildren: false });
  private readonly badges = new Map<string, Badge>();

  /** Shows exactly `marks`, each badge `scale` world units per UI unit. */
  sync(marks: readonly SightMark[], scale: number): void {
    const colors = canvasBadgeColors();
    const wanted = new Set(marks.map((mark) => mark.tokenId));
    for (const [id, badge] of this.badges) {
      if (wanted.has(id)) continue;
      destroyTree(badge.view);
      this.badges.delete(id);
    }
    for (const mark of marks) {
      let badge = this.badges.get(mark.tokenId);
      // A badge of the other kind or drawn in the other theme is drawn anew.
      if (badge && (badge.kind !== mark.kind || badge.background !== colors.background)) {
        destroyTree(badge.view);
        badge = undefined;
      }
      if (!badge) {
        badge = { view: this.view.addChild(drawBadge(mark.kind, colors)), kind: mark.kind, background: colors.background };
        this.badges.set(mark.tokenId, badge);
      }
      badge.view.position.set(mark.x, mark.y);
      badge.view.scale.set(scale);
    }
    this.view.visible = marks.length > 0;
  }

  /** The tokens marked now, with the kind of each mark. */
  shown(): Array<[string, SightMark['kind']]> {
    return [...this.badges].map(([id, badge]) => [id, badge.kind]);
  }

  destroy(): void {
    this.badges.clear();
    destroyTree(this.view);
  }
}

function drawBadge(kind: SightMark['kind'], colors: CanvasBadgeColors): Container {
  const view = new Container();
  const badge = view.addChild(new Graphics());
  // A dark hairline keeps the badge's edge on a map as light as the badge.
  badge.circle(0, 0, SIGHT_MARK_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  badge.circle(0, 0, SIGHT_MARK_RADIUS).fill({ color: colors.background, alpha: 0.95 });
  badge.circle(0, 0, SIGHT_MARK_RADIUS - 1).stroke({ width: 1, color: colors.stroke, alpha: 0.35 });
  if (kind === 'sensed') drawOutlineGlyph(badge, colors.stroke);
  else view.addChild(drawEyeOff(colors.stroke));
  return view;
}

/** Lucide's `eye-off`, as on a token hidden from the players, in the badge's ink. */
function drawEyeOff(color: number): Graphics {
  const ink = `#${color.toString(16).padStart(6, '0')}`;
  const eye = new Graphics().svg(
    `<svg viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${EYE_OFF_SVG}</svg>`,
  );
  eye.scale.set(GLYPH_SIZE / 24);
  eye.position.set(-GLYPH_SIZE / 2);
  return eye;
}

/** The outline the players see of a sensed token, in small: a dashed circle around a dot. */
function drawOutlineGlyph(g: Graphics, color: number): void {
  const radius = GLYPH_SIZE / 2 - 0.5;
  const dashes = 6;
  for (let i = 0; i < dashes; i++) {
    const from = (i / dashes) * 2 * Math.PI;
    g.moveTo(Math.cos(from) * radius, Math.sin(from) * radius);
    g.arc(0, 0, radius, from, from + (Math.PI / dashes) * 1.1);
  }
  g.stroke({ width: 1.5, color, cap: 'round' });
  g.circle(0, 0, 1.4).fill({ color });
}
