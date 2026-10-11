import type { AccountApi } from '../account/AccountControl.ts';
import { accountText, noticeText, planText, UNREACHABLE_TEXT, type AccountView } from '../account/accountView.ts';
import { statusLine, textButton } from './controls.ts';

/** What the menu's sign-in parts do. */
export interface AccountActions {
  start(): void;
  signIn(): void;
  cancelSignIn(): void;
  reopenSignIn(): void;
  signOut(): void;
  /** Asks the relay again (after it could not be reached). */
  retry(): void;
  redeem(key: string): void;
}

/** The sign-in actions over the account control; `start` is the dock's own. */
export function accountActions(account: AccountApi): Omit<AccountActions, 'start'> {
  return {
    signIn: () => void account.signIn(),
    cancelSignIn: () => account.cancelSignIn(),
    reopenSignIn: () => account.reopenSignIn(),
    signOut: () => void account.signOut(),
    retry: () => void account.refresh(true),
    redeem: (key) => void account.redeem(key),
  };
}

const INTRO = 'Players see this map in their browsers and move their own tokens.';

/** A code as the approve page shows it: two groups of four. */
export const shownCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

function intro(layer: HTMLElement, title = 'Online play'): HTMLElement {
  const head = layer.createDiv({ cls: 'atlas-online-text-block' });
  head.createDiv({ cls: 'atlas-online-title', text: title });
  return head;
}

function help(parent: HTMLElement, text: string, cls = ''): HTMLElement {
  return parent.createDiv({ cls: `atlas-online-help ${cls}`.trim(), text });
}

function button(layer: HTMLElement, text: string, focusKey: string, onClick: () => void, kind: 'plain' | 'cta' = 'plain', corner = false): HTMLButtonElement {
  const made = textButton(layer, text, onClick, kind);
  made.dataset.focusKey = focusKey;
  if (corner) made.addClass('atlas-online-corner-button');
  return made;
}

/** "Signed in as Mara (@mara)" and Sign out, in one row. */
function accountRow(layer: HTMLElement, text: string, actions: AccountActions, corner: boolean): void {
  const row = layer.createDiv({ cls: 'atlas-online-account' });
  row.createDiv({ cls: 'atlas-online-help', text: `Signed in as ${text}` });
  const out = textButton(row, 'Sign out', () => actions.signOut());
  out.dataset.focusKey = 'sign-out';
  if (corner) out.addClass('atlas-online-corner-button');
}

/** The invite key field and Redeem, with the reason the last key was refused. */
function redeemRow(layer: HTMLElement, redeeming: boolean, error: string | null, actions: AccountActions): void {
  const form = layer.createEl('form', { cls: 'atlas-online-redeem' });
  const input = form.createEl('input', {
    cls: 'atlas-online-redeem__input',
    attr: { type: 'text', placeholder: 'Invite key', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Invite key', 'data-focus-key': 'invite-key', maxlength: '64' },
  });
  const redeem = textButton(form, redeeming ? 'Redeeming…' : 'Redeem', () => undefined);
  redeem.type = 'submit';
  redeem.dataset.focusKey = 'redeem';
  redeem.disabled = redeeming;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim() !== '') actions.redeem(input.value.trim());
  });
  if (error !== null) help(layer, error, 'atlas-online-error').setAttribute('role', 'alert');
}

/** Start online table: the menu's last control, in its bottom corners. */
function startButton(layer: HTMLElement, starting: boolean, enabled: boolean, actions: AccountActions): void {
  const start = button(layer, starting ? 'Starting…' : 'Start online table', 'start', () => actions.start(), 'cta', true);
  start.disabled = !enabled || starting;
}

/**
 * The menu before a table runs: as the owner (create key), signed out, waiting for the browser,
 * checking the account, unreachable, signed in without access (invite key), or able to host.
 */
export function renderAccountMenu(layer: HTMLElement, account: AccountView, starting: boolean, actions: AccountActions): void {
  switch (account.kind) {
    case 'owner':
      help(intro(layer), INTRO);
      return startButton(layer, starting, true, actions);
    case 'signed-out': {
      const head = intro(layer);
      help(head, INTRO);
      help(head, 'Use your Atlas account to host tables.');
      const notice = noticeText(account.notice);
      if (notice !== null) statusLine(head, { text: notice, tone: account.notice === 'server' ? 'amber' : 'red' });
      button(layer, 'Sign in to host', 'sign-in', () => actions.signIn(), 'cta', true);
      return;
    }
    case 'waiting': {
      const head = intro(layer, 'Sign in to host');
      if (account.userCode === null) {
        statusLine(head, { text: 'Opening your browser…', tone: 'amber' });
      } else {
        help(head, 'Approve this code in your browser. Atlas waits here.');
        head.createDiv({ cls: 'atlas-online-code', text: shownCode(account.userCode), attr: { 'aria-label': `Code ${account.userCode.split('').join(' ')}` } });
      }
      const row = layer.createDiv({ cls: 'atlas-online-actions' });
      button(row, 'Open again', 'reopen', () => actions.reopenSignIn(), 'plain', true).disabled = account.userCode === null;
      button(row, 'Cancel', 'cancel', () => actions.cancelSignIn(), 'plain', true);
      return;
    }
    case 'checking':
      statusLine(intro(layer), { text: 'Checking your account…', tone: 'muted' });
      return startButton(layer, starting, false, actions);
    case 'unreachable': {
      const head = intro(layer);
      statusLine(head, { text: UNREACHABLE_TEXT, tone: 'red' });
      help(head, 'Running tables are unaffected.');
      button(layer, 'Try again', 'retry', () => actions.retry(), 'plain', true);
      return;
    }
    case 'no-access': {
      const head = intro(layer, 'Online play is in early access');
      help(head, 'Enter your invite key to host tables.');
      redeemRow(layer, account.redeeming, account.redeemError, actions);
      return accountRow(layer, accountText(account.account), actions, true);
    }
    case 'can-host': {
      const head = intro(layer);
      help(head, INTRO);
      help(head, planText(account.access));
      accountRow(layer, accountText(account.account), actions, false);
      return startButton(layer, starting, true, actions);
    }
  }
}
