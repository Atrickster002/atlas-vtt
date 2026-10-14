import { animatePanelIn } from '../../../ui/panelMotion';
import type { GateActions, WaitingPlayer } from '../joinGate.ts';
import { textButton } from './controls.ts';
import { BAR_GAP, roomAbove, rowOf } from './dockDom.ts';

/** The cards' width; never wider than the row the control hangs from. */
const KNOCK_WIDTH = 300;
/** The room the open control always leaves above itself: one card and the gap under it. */
export const KNOCK_ROOM = 64;

export type KnockActions = Pick<GateActions, 'admit' | 'decline' | 'moved'>;

/**
 * Decline or Admit. It takes a press only once its card has stood for the arming time (`armed`, kept
 * with the knock) and until the GM answered; before and after it stays in place and reads as off.
 */
function answerButton(row: HTMLElement, player: WaitingPlayer, kind: 'admit' | 'decline', run: (id: string) => void): void {
  const live = player.armed && !player.answered;
  const button = textButton(row, kind === 'admit' ? 'Admit' : 'Decline', () => live && run(player.id), kind === 'admit' ? 'cta' : 'ghost');
  button.dataset.focusKey = `${kind}:${player.id}`;
  // Not `disabled`: the button keeps its place in the Tab order, and the one the GM pressed the focus.
  if (!live) button.setAttribute('aria-disabled', 'true');
}

/**
 * A card per newcomer who waits for the GM: the name, Decline and Admit. The name is the newcomer's
 * own text: one line in a box of its own, cut with an ellipsis, its direction kept to itself, so it
 * can neither reorder the card's words nor move its buttons. One the GM admitted into a table that had
 * filled meanwhile says so for a moment.
 */
export function renderKnocks(parent: HTMLElement, waiting: readonly WaitingPlayer[], actions: Pick<GateActions, 'admit' | 'decline'>): void {
  for (const player of waiting) {
    const row = parent.createDiv({ cls: 'atlas-online-knock', attr: { role: 'group', 'aria-label': `${player.name} wants to join` } });
    const text = row.createSpan({ cls: 'atlas-online-knock__text' });
    text.createEl('bdi', { cls: 'atlas-online-knock__name', text: player.name });
    text.createSpan({ cls: 'atlas-online-knock__rest', text: player.full ? ': table full' : ' wants to join' });
    if (player.full) continue;
    answerButton(row, player, 'decline', actions.decline);
    answerButton(row, player, 'admit', actions.admit);
  }
}

/**
 * The newcomers who wait for the GM, as cards over the control, whether it is closed or open. They
 * stand outside the menu's and the panel's flow, because whoever knocks chooses the moment: a card
 * that came between the rows would push them, and its Admit could land under a press meant for one of
 * them. Here a new card goes above the earlier ones, which stay where they are, and the control keeps
 * room for one card above itself (`KNOCK_ROOM`), so a knock moves nothing; more cards than the view has
 * room for scroll, the earliest in sight. What does move the cards (the control changing its size
 * under them) is told to the knocks (`moved`), which then take no answer for a moment, as they do
 * when one of them leaves.
 *
 * It never takes the keyboard's focus (the map keeps its keys); Tab reaches its buttons, and focus
 * that was on a card which left goes to the next card, or to `fallback`.
 */
export class KnockStack {
  private readonly el: HTMLElement;
  private readonly root: HTMLElement;
  private readonly container: HTMLElement;
  private readonly fallback: HTMLElement;
  private readonly resizes: ResizeObserver;
  private actions: KnockActions | null = null;
  private shownKey = '';

  constructor(root: HTMLElement, container: HTMLElement, fallback: HTMLElement) {
    this.root = root;
    this.container = container;
    this.fallback = fallback;
    this.el = root.createDiv({ cls: 'atlas-online-knocks', attr: { role: 'region', 'aria-label': 'Players asking to join', 'aria-live': 'polite' } });
    this.el.hidden = true;
    // The cards hang from the control's top edge: when it changes its size, they moved.
    this.resizes = new ResizeObserver(() => this.reflow());
    this.resizes.observe(root);
  }

  /** The control or the surface open above it changed: the cards move along. */
  reflow(): void {
    this.fit();
    if (!this.el.hidden) this.actions?.moved();
  }

  /** Shows a card per waiting player; none hides it. */
  update(waiting: readonly WaitingPlayer[], actions: KnockActions): void {
    this.actions = actions;
    const width = Math.min(KNOCK_WIDTH, rowOf(this.container)?.clientWidth ?? KNOCK_WIDTH);
    const key = JSON.stringify([waiting, width]);
    if (key === this.shownKey) return;
    this.shownKey = key;
    const active = this.el.doc.activeElement;
    const focus = active !== null && this.el.contains(active) ? active.getAttribute('data-focus-key') : null;
    const appears = this.el.hidden && waiting.length > 0;
    const scroll = this.el.scrollTop;
    this.el.empty();
    this.el.hidden = waiting.length === 0;
    this.el.style.width = `${width}px`;
    // The control's border as the browser draws it (snapped to device pixels), so the cards' edge lies on the control's.
    if (appears) this.el.style.setProperty('--atlas-online-dock-border', getComputedStyle(this.root).borderLeftWidth);
    this.fit();
    renderKnocks(this.el, waiting, actions);
    this.el.scrollTop = scroll;
    if (focus !== null) {
      const target = this.el.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`) ?? this.el.querySelector<HTMLElement>('button') ?? this.fallback;
      target.focus({ preventScroll: true });
    }
    if (appears) animatePanelIn(this.el);
  }

  dispose(): void {
    this.resizes.disconnect();
    this.el.remove();
  }

  /** The cards' tallest height: from a gap above the control (or the surface open over it) up to a gap below the scene tabs. */
  private fit(): void {
    const row = rowOf(this.container);
    if (row === null) return;
    // The open surface says how far it reaches above the control (`DockSurface`).
    const above = parseFloat(this.root.style.getPropertyValue('--atlas-online-above')) || 0;
    const room = roomAbove(this.container, row, BAR_GAP) - this.root.offsetHeight - above - BAR_GAP;
    this.el.style.setProperty('--atlas-online-knocks-max', `${Math.max(0, room)}px`);
  }
}
