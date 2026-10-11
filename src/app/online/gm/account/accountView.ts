import type { AccessRefusal, AccountAnswer, AccountInfo, HostAccess } from './relayAccount.ts';

/**
 * What the dock and the settings show of the GM's account, as pure rules. The GM signs in with an
 * Atlas account, and the relay says what it may host or why it may not: nothing here decides that.
 */

/** A line that tells the GM why they are signed out. */
export type SignedOutNotice = 'timed-out' | 'declined' | 'server' | 'unreachable' | null;

export type AccountView =
  | { readonly kind: 'signed-out'; readonly notice: SignedOutNotice }
  /** The sign-in waits for approval in the browser; the code is null until the service gave one. */
  | { readonly kind: 'waiting'; readonly userCode: string | null }
  | { readonly kind: 'checking' }
  | { readonly kind: 'unreachable' }
  /** The relay says the account may not host; `reason` is null for one this version does not know. */
  | { readonly kind: 'no-access'; readonly account: AccountInfo; readonly reason: AccessRefusal | null }
  | { readonly kind: 'can-host'; readonly account: AccountInfo; readonly access: HostAccess };

/** What the account control knows when it decides what to show. */
export interface AccountFacts {
  readonly signingIn: boolean;
  readonly userCode: string | null;
  readonly token: boolean;
  /** The last answer of `/api/me` for this token; null until one came. */
  readonly me: AccountAnswer | 'unreachable' | null;
  readonly notice: SignedOutNotice;
}

export function accountView(facts: AccountFacts): AccountView {
  if (facts.signingIn) return { kind: 'waiting', userCode: facts.userCode };
  if (!facts.token) return { kind: 'signed-out', notice: facts.notice };
  if (facts.me === null) return { kind: 'checking' };
  if (facts.me === 'unreachable') return { kind: 'unreachable' };
  const { account } = facts.me;
  return facts.me.access === null ? { kind: 'no-access', account, reason: facts.me.reason } : { kind: 'can-host', account, access: facts.me.access };
}

const ACCESS_TEXT: Readonly<Record<AccessRefusal, string>> = {
  'no-access': 'Online play is in early access. Redeem an invite key on your account page.',
  'access-ended': 'Your access to online play has ended. See your account page.',
  'access-revoked': 'Your access to online play was withdrawn. See your account page.',
  'account-restricted': 'Your account is restricted and cannot host online tables. See your account page.',
  'terms-not-accepted': 'Accept the current Terms on your account page to host online tables.',
};

/** What is said of an account that may not host, whatever the reason. */
export const NO_HOSTING_TEXT = 'This account may not host online tables now.';

/** Why the relay says the account may not host, and where the way on is: the account page. */
export const accessText = (reason: AccessRefusal | null): string => (reason === null ? `${NO_HOSTING_TEXT} See your account page.` : ACCESS_TEXT[reason]);

export const UNREACHABLE_TEXT = 'Can’t reach Atlas sign-in right now.';
export const SERVER_SIGNED_OUT_TEXT = 'You were signed out. Running tables keep going.';

/** The line under the sign-in button that says how the last sign-in ended. */
export function noticeText(notice: SignedOutNotice): string | null {
  switch (notice) {
    case 'timed-out': return 'Sign-in timed out.';
    case 'declined': return 'Sign-in was declined.';
    case 'server': return SERVER_SIGNED_OUT_TEXT;
    case 'unreachable': return UNREACHABLE_TEXT;
    default: return null;
  }
}

const PLAN_NAMES: Readonly<Record<string, string>> = { beta: 'Early access', free: 'Free', host: 'Host', staff: 'Staff' };

/** The plan as a short tag beside the menu's title; none for the ordinary plan, which needs no word. */
export function planTag(access: HostAccess): string | null {
  return access.plan === 'host' ? null : PLAN_NAMES[access.plan] ?? access.plan;
}

/** The plan in words: "Early access · up to 12 players". */
export function planText(access: HostAccess): string {
  const players = access.maxPlayers === 1 ? '1 player' : `${access.maxPlayers} players`;
  return `${PLAN_NAMES[access.plan] ?? access.plan} · up to ${players}`;
}

/** "Mara (@mara)", or the handle alone where the name is the handle. */
export function accountText(account: AccountInfo): string {
  return account.name === '' || account.name === account.handle ? `@${account.handle}` : `${account.name} (@${account.handle})`;
}
