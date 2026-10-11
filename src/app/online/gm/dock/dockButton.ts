import { setIcon } from 'obsidian';
import { MOTION_EASE_OUT, prefersReducedMotion } from '../../../utils/motion';
import type { Badge } from './panelModel.ts';

/** How long the badge pops when it appears or its number changes. */
const BADGE_POP_MS = 160;

const badgeKey = (badge: Badge): string => (badge.kind === 'dot' ? `dot:${badge.tone}` : badge.kind === 'count' ? `count:${badge.count}` : 'none');

/**
 * What the collapsed control shows: the button that fills it (globe, hover and accent fill) and, in
 * the pin, a box of the collapsed size at the control's bottom left, its status badge and tooltip. The
 * pin stays where the button rests while the control grows into the menu, and lies outside the
 * clipped content, so the badge may stand over the control's corner.
 */
export class DockButton {
  readonly button: HTMLButtonElement;
  readonly pin: HTMLElement;
  private readonly badge: HTMLElement;
  private shownBadge = 'none';

  constructor(root: HTMLElement, content: HTMLElement, onPress: (byKeyboard: boolean) => void) {
    this.button = content.createEl('button', { cls: 'atlas-online-dock__button', attr: { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
    setIcon(this.button.createSpan({ cls: 'atlas-online-dock__face' }), 'globe');
    this.button.createSpan({ cls: 'sr-only', text: 'Online play' });
    this.pin = root.createDiv({ cls: 'atlas-online-dock__pin' });
    this.badge = this.pin.createSpan({ cls: 'atlas-online-badge', attr: { 'aria-hidden': 'true' } });
    this.badge.hidden = true;
    // A click from the keyboard (Enter or Space) has no pointer position and counts no clicks.
    this.button.addEventListener('click', (event) => onPress(event.detail === 0));
  }

  /** What fades out as the control opens and back in as it closes. */
  get collapsedParts(): readonly HTMLElement[] {
    return [this.button, this.pin];
  }

  /**
   * An open control's button takes the accent as it fades into the menu, names the surface it
   * controls, and is inert: the surface lies over it.
   */
  setOpen(open: boolean, surfaceId: string | null): void {
    this.button.toggleClass('is-active', open);
    this.button.inert = open;
    this.button.setAttribute('aria-expanded', String(open));
    if (surfaceId === null) this.button.removeAttribute('aria-controls');
    else this.button.setAttribute('aria-controls', surfaceId);
  }

  setBadge(badge: Badge): void {
    const key = badgeKey(badge);
    if (key === this.shownBadge) return;
    const appeared = this.shownBadge === 'none' || (badge.kind === 'count' && !this.shownBadge.startsWith('count'));
    this.shownBadge = key;
    this.badge.hidden = badge.kind === 'none';
    this.badge.className = 'atlas-online-badge';
    this.badge.empty();
    if (badge.kind === 'dot') {
      this.badge.addClass('atlas-online-badge--dot', `atlas-online-tone--${badge.tone}`);
      this.badge.toggleClass('atlas-online-badge--pulse', badge.pulse);
    } else if (badge.kind === 'count') {
      this.badge.addClass('atlas-online-badge--count', 'atlas-online-tone--green');
      this.badge.setText(String(badge.count));
    }
    if (badge.kind !== 'none' && (appeared || badge.kind === 'count') && !prefersReducedMotion(this.badge)) {
      this.badge.animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: BADGE_POP_MS, easing: MOTION_EASE_OUT });
    }
  }
}
