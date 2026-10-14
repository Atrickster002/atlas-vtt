import { textButton } from './controls.ts';

export interface ClosingRowActions {
  /** Opens the account page of the website, where access to online play comes from. */
  openAccountPage(): void;
}

/**
 * Under a surface's header while the relay has said that the table closes because its account may no
 * longer host: when, in the GM's own time, and the way to the account page. The line goes when the
 * relay takes the word back.
 */
export function renderClosingRow(layer: HTMLElement, closing: string | null, actions: ClosingRowActions): void {
  if (closing === null) return;
  const row = layer.createDiv({ cls: 'atlas-online-closing', attr: { role: 'status' } });
  row.createSpan({ cls: 'atlas-online-closing__text', text: closing });
  textButton(row, 'Account page', () => actions.openAccountPage()).dataset.focusKey = 'account-page';
}
