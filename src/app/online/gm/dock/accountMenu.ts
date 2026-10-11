import type { AccountApi } from '../account/AccountControl.ts';
import { accessText, accountText, noticeText, planText, UNREACHABLE_TEXT, type AccountView } from '../account/accountView.ts';
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
  /** Opens the account page of the website: invite keys are redeemed there, and it says what the account may host. */
  openAccountPage(): void;
}

/** The sign-in actions over the account control; `start` is the dock's own. */
export function accountActions(account: AccountApi): Omit<AccountActions, 'start'> {
  return {
    signIn: () => void account.signIn(),
    cancelSignIn: () => account.cancelSignIn(),
    reopenSignIn: () => account.reopenSignIn(),
    signOut: () => void account.signOut(),
    retry: () => void account.refresh(true),
    openAccountPage: () => account.openAccountPage(),
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

function help(parent: HTMLElement, text: string): void {
  parent.createDiv({ cls: 'atlas-online-help', text });
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

function accountPageButton(layer: HTMLElement, actions: AccountActions, kind: 'plain' | 'cta' = 'plain'): void {
  button(layer, 'Open account page', 'account-page', () => actions.openAccountPage(), kind);
}

/** Start online table: the menu's last control, in its bottom corners. */
function startButton(layer: HTMLElement, starting: boolean, enabled: boolean, actions: AccountActions): void {
  const start = button(layer, starting ? 'Starting…' : 'Start online table', 'start', () => actions.start(), 'cta', true);
  start.disabled = !enabled || starting;
}

/**
 * The menu before a table runs: signed out, waiting for the browser,
 * checking the account, unreachable, signed in without access (the relay's reason, and the way to the
 * account page), or able to host.
 */
export function renderAccountMenu(layer: HTMLElement, account: AccountView, starting: boolean, actions: AccountActions): void {
  const head = intro(layer, account.kind === 'waiting' ? 'Sign in to host' : undefined);
  switch (account.kind) {
    case 'signed-out': {
      help(head, INTRO);
      help(head, 'Use your Atlas account to host tables.');
      const notice = noticeText(account.notice);
      if (notice !== null) statusLine(head, { text: notice, tone: account.notice === 'server' ? 'amber' : 'red' });
      button(layer, 'Sign in to host', 'sign-in', () => actions.signIn(), 'cta', true);
      return;
    }
    case 'waiting': {
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
      statusLine(head, { text: 'Checking your account…', tone: 'muted' });
      return startButton(layer, starting, false, actions);
    case 'unreachable':
      statusLine(head, { text: UNREACHABLE_TEXT, tone: 'red' });
      help(head, 'Running tables are unaffected.');
      button(layer, 'Try again', 'retry', () => actions.retry(), 'plain', true);
      return;
    case 'no-access':
      help(head, accessText(account.reason));
      accountPageButton(layer, actions, 'cta');
      return accountRow(layer, accountText(account.account), actions, true);
    case 'can-host':
      help(head, INTRO);
      help(head, planText(account.access));
      accountRow(layer, accountText(account.account), actions, false);
      return startButton(layer, starting, true, actions);
  }
}
