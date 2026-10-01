import { Container } from 'pixi.js';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { conditionGlyph } from '../../utils/conditionGlyph';
import { conditionLabel, conditionValue, type TokenConditionState } from '../../utils/conditionValues';
import { prefersReducedMotion } from '../../utils/motion';
import { ConditionBadgeRing, type ActiveCondition } from './ConditionBadgeRing';
import { ConditionHoverPanel } from './ConditionHoverPanel';

const UNKNOWN_COLOR = 0x808080;

export interface TokenConditionsLayout {
  /** Radius of the token's ring band, in world units from the token centre. */
  ringRadius: number;
  /** World units per UI unit for the badges on the ring. */
  badgeScale: number;
  /** World units per screen pixel for the hover card. */
  cardScale: number;
}

/**
 * A token's conditions: badges on its ring and, while the token is hovered, a card
 * beside it that names them. Lives in the token's UI container, centred on the token.
 */
export class TokenConditionsUI {
  readonly container = new Container({ eventMode: 'none', interactiveChildren: false });
  private ring = new ConditionBadgeRing();
  private card = new ConditionHoverPanel();
  private conditions: ActiveCondition[] = [];
  /** A line under the conditions on the hover card; the card shows for it alone too. */
  private note: string | null = null;
  private isHovered = false;

  constructor() {
    this.container.addChild(this.ring.container, this.card.container);
  }

  update(token: TokenConditionState, definitions: readonly ConditionDefinition[], layout: TokenConditionsLayout, note: string | null = null): void {
    this.conditions = resolveActiveConditions(token, definitions);
    this.note = note;
    this.ring.update(this.conditions, layout.ringRadius, layout.badgeScale, this.canAnimate());
    this.card.place(layout.ringRadius, layout.cardScale);
    if (this.isHovered) this.card.show(this.conditions, false, this.note);
  }

  /** The note changed while the card may be open (the players' sight did): the card follows without its entrance. */
  setNote(note: string | null): void {
    if (this.note === note) return;
    this.note = note;
    if (this.isHovered) this.card.show(this.conditions, false, note);
  }

  /** The hover card is open for its note: something to show on a token that has nothing else. */
  get showsNote(): boolean {
    return this.isHovered && this.note !== null;
  }

  /** Keeps the card at a constant screen size while the viewport zooms. */
  setCardScale(ringRadius: number, cardScale: number): void {
    this.card.place(ringRadius, cardScale);
  }

  /** `note` is read when the hover begins, so it is as fresh as the card. */
  setHovered(hovered: boolean, note: () => string | null = () => this.note): void {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;
    if (hovered) this.note = note();
    if (hovered) this.card.show(this.conditions, this.canAnimate(), this.note);
    else this.card.hide(this.canAnimate());
  }

  /** Hides everything while the token is resized or rotated, when the ring moves under the badges. */
  setHidden(hidden: boolean): void {
    this.container.visible = !hidden;
  }

  destroy(): void {
    this.ring.destroy();
    this.card.destroy();
    this.container.destroy();
  }

  private canAnimate(): boolean {
    return !prefersReducedMotion(document.body);
  }
}

/**
 * The token's conditions in the order it gained them, skipping any its collection no
 * longer defines. Valued conditions carry their number ("Frightened 2").
 */
export function resolveActiveConditions(
  token: TokenConditionState,
  definitions: readonly ConditionDefinition[],
): ActiveCondition[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return (token.conditions ?? []).flatMap((id) => {
    const definition = byId.get(id);
    if (!definition) return [];
    const color = Number.parseInt(definition.color.replace('#', ''), 16);
    const value = conditionValue(token, id);
    return [{
      id,
      name: conditionLabel(definition, value),
      color: Number.isNaN(color) ? UNKNOWN_COLOR : color,
      glyph: conditionGlyph(definition),
      ...(definition.valued && { value }),
    }];
  });
}
