import { renderClosingRow, type ClosingRowActions } from './closingRow.ts';
import { inviteRow, surfaceHeader, textButton } from './controls.ts';
import type { MenuEntry } from './dockMenu.ts';
import { renderFeedback, type FeedbackActions, type FeedbackView } from './feedbackForm.ts';
import { gateEntries, gateRowsOf, renderCodeRow, renderPausedRow, type GateRowActions, type GateRows } from './gateRows.ts';
import { renderImageRow, type ImageRowActions } from './imageRow.ts';
import { closingOf, groupsOf, seatsNoteOf, selectionBarOf, statusOf, type OnlinePlayer, type OnlineSnapshot, type PlayerGroup, type SceneFacts, type SelectionBar, type Tone } from './panelModel.ts';
import { renderPlayerList, type ListActions } from './playerList.ts';
import { renderSelectionBar, type SelectionActions } from './selectionBar.ts';

/** The panel's width; it never grows wider than the row it hangs from. */
export const PANEL_WIDTH = 340;

/** What the panel shows. */
export interface PanelView {
  readonly status: { readonly text: string; readonly tone: Tone };
  /** Said in the header while the table is full. */
  readonly seatsNote: string | null;
  readonly link: string | null;
  /** The invite link's QR card is open. */
  readonly qr: boolean;
  /** The table's gates: the join code, the two switches, a pause. */
  readonly gate: GateRows | null;
  /** Players are shown an image over the map. */
  readonly imageShown: boolean;
  /** The table closes because its account may no longer host: the line that says when; null otherwise. */
  readonly closing: string | null;
  readonly groups: readonly PlayerGroup[];
  readonly players: readonly OnlinePlayer[];
  readonly bar: SelectionBar | null;
  readonly feedback: FeedbackView;
}

/** What the panel shows of a snapshot, the map views, the feedback form and whether the QR card is open. */
export function panelView(snapshot: OnlineSnapshot, scene: SceneFacts, feedback: FeedbackView, qr = false): PanelView {
  const groups = groupsOf(snapshot, scene);
  const players = groups.flatMap((group) => (group.player === null ? [] : [group.player]));
  return { status: statusOf(snapshot), seatsNote: seatsNoteOf(snapshot), link: snapshot.link, qr, gate: gateRowsOf(snapshot.gate), imageShown: snapshot.imageShown === true, closing: closingOf(snapshot), groups, players, bar: selectionBarOf(snapshot, scene), feedback };
}

export interface PanelActions extends ListActions, SelectionActions, FeedbackActions, GateRowActions, ImageRowActions, ClosingRowActions {
  close(): void;
  stop(): void;
  copy(): Promise<boolean>;
  toggleQr(): void;
  openSettings(): void;
}

/** Panels whose Stop waits for its confirmation; kept apart from the DOM, which every redraw replaces. */
const confirmingStop = new WeakSet<HTMLElement>();

/** The control focused before a redraw, by its `data-focus-key`, and the list's scroll position. */
interface Kept {
  readonly focus: string | null;
  readonly scroll: number;
}

function keep(layer: HTMLElement): Kept {
  const active = layer.doc.activeElement;
  const focus = active !== null && layer.contains(active) ? active.getAttribute('data-focus-key') : null;
  return { focus, scroll: layer.querySelector('.atlas-online-list')?.scrollTop ?? 0 };
}

function restore(layer: HTMLElement, kept: Kept): void {
  const list = layer.querySelector('.atlas-online-list');
  if (list !== null) list.scrollTop = kept.scroll;
  if (kept.focus !== null) layer.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(kept.focus)}"]`)?.focus({ preventScroll: true });
}

/** The status in words where it needs the GM's eye: the table full, connecting, refused. */
function statusInWords(view: PanelView): string | null {
  if (view.seatsNote !== null) return view.seatsNote;
  return view.status.tone === 'green' ? null : view.status.text;
}

/** "Stop the table for everyone?" with Cancel and Stop, at the panel's foot. */
function stopConfirm(layer: HTMLElement, actions: PanelActions, redraw: () => void): void {
  const row = layer.createDiv({ cls: 'atlas-online-confirm', attr: { role: 'group', 'aria-label': 'Stop the table' } });
  row.createSpan({ cls: 'atlas-online-confirm__text', text: 'Stop for everyone?' });
  const cancel = textButton(row, 'Cancel', () => {
    confirmingStop.delete(layer);
    redraw();
  }, 'ghost');
  cancel.dataset.focusKey = 'stop-cancel';
  const stop = textButton(row, 'Stop table', () => {
    confirmingStop.delete(layer);
    actions.stop();
  }, 'warning');
  stop.dataset.focusKey = 'stop-confirm';
  stop.addClass('atlas-online-corner-button');
}

/**
 * The online panel: the working surface while players are at the table. A header with the title, the
 * status as a dot, "…" (Settings, Send feedback, the gates' New code and two switches, Stop table) and
 * Close; the line of a table that closes for want of access; the line of a pause; the line of a shown image; Copy invite link and the join code; the players with their tokens; the bar for the selected tokens or to show this map; the feedback form and Stop's
 * confirmation while open. Redrawn whole on every change, keeping focus and the list's scroll position.
 */
export function renderPanel(layer: HTMLElement, view: PanelView, actions: PanelActions): void {
  const kept = keep(layer);
  const hadBar = layer.querySelector('.atlas-online-selection') !== null;
  const redraw = (): void => renderPanel(layer, view, actions);
  layer.empty();
  layer.addClass('atlas-online-panel');
  const entries: MenuEntry[] = [
    { title: 'Settings', icon: 'settings', run: () => actions.openSettings() },
    { title: view.feedback.open ? 'Close feedback' : 'Send feedback', icon: 'message-square', run: () => actions.toggleFeedback() },
    ...gateEntries(view.gate, actions),
    { title: 'Stop table', icon: 'power', warning: true, apart: true, run: () => {
      confirmingStop.add(layer);
      redraw();
      layer.querySelector<HTMLElement>('[data-focus-key="stop-confirm"]')?.focus();
    } },
  ];
  surfaceHeader(layer, 'Online table', view.status, statusInWords(view), entries, () => actions.close());
  renderClosingRow(layer, view.closing, actions);
  renderPausedRow(layer, view.gate, actions);
  renderImageRow(layer, view.imageShown, actions);
  if (view.link !== null) inviteRow(layer, () => actions.copy(), { open: view.qr, toggle: () => actions.toggleQr() });
  renderCodeRow(layer, view.gate, actions);
  renderPlayerList(layer, view.groups, view.players, actions);
  if (view.bar !== null) renderSelectionBar(layer, view.bar, view.players, actions, !hadBar);
  if (view.feedback.open) renderFeedback(layer, view.feedback, actions);
  if (confirmingStop.has(layer)) stopConfirm(layer, actions, redraw);
  restore(layer, kept);
}
