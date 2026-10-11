import type { AccountInfo, HostAccess, RedeemRefusal } from './relayAccount.ts';

/**
 * What the dock and the settings show of the GM's account, as pure rules. The create key, while set,
 * hosts without an account (the owner's override); otherwise the GM signs in with an Atlas account
 * and hosts with its early-access grant.
 */

/** A line that tells the GM why they are signed out. */
export type SignedOutNotice = 'timed-out' | 'declined' | 'server' | 'unreachable' | null;

export type AccountView =
  | { readonly kind: 'owner' }
  | { readonly kind: 'signed-out'; readonly notice: SignedOutNotice }
  /** The sign-in waits for approval in the browser; the code is null until the service gave one. */
  | { readonly kind: 'waiting'; readonly userCode: string | null }
  | { readonly kind: 'checking' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'no-access'; readonly account: AccountInfo; readonly redeeming: boolean; readonly redeemError: string | null }
  | { readonly kind: 'can-host'; readonly account: AccountInfo; readonly access: HostAccess };

/** What the account control knows when it decides what to show. */
export interface AccountFacts {
  readonly createKey: boolean;
  readonly signingIn: boolean;
  readonly userCode: string | null;
  readonly token: boolean;
  /** The last answer of `/api/me` for this token; null until one came. */
  readonly me: { readonly account: AccountInfo; readonly access: HostAccess | null } | 'unreachable' | null;
  readonly notice: SignedOutNotice;
  readonly redeeming: boolean;
  readonly redeemError: string | null;
}

export function accountView(facts: AccountFacts): AccountView {
  if (facts.createKey) return { kind: 'owner' };
  if (facts.signingIn) return { kind: 'waiting', userCode: facts.userCode };
  if (!facts.token) return { kind: 'signed-out', notice: facts.notice };
  if (facts.me === null) return { kind: 'checking' };
  if (facts.me === 'unreachable') return { kind: 'unreachable' };
  const { account, access } = facts.me;
  return access === null ? { kind: 'no-access', account, redeeming: facts.redeeming, redeemError: facts.redeemError } : { kind: 'can-host', account, access };
}

/** Whether a table can be asked for in this state. */
export const mayHost = (view: AccountView): boolean => view.kind === 'owner' || view.kind === 'can-host';

const REDEEM_TEXT: Readonly<Record<RedeemRefusal, string>> = {
  invalid: 'This key isn’t valid.',
  used: 'This key has already been used.',
  expired: 'This key has expired.',
  'too-many-tries': 'Too many tries, try again tomorrow.',
  'rate-limited': 'Too many tries, wait a minute.',
  'already-has-access': 'Your account can host already.',
};

export const redeemText = (reason: RedeemRefusal): string => REDEEM_TEXT[reason];

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

/** The plan in words: "Early access · up to 12 players". */
export function planText(access: HostAccess): string {
  const players = access.maxPlayers === 1 ? '1 player' : `${access.maxPlayers} players`;
  return `${PLAN_NAMES[access.plan] ?? access.plan} · up to ${players}`;
}

/** "Mara (@mara)", or the handle alone where the name is the handle. */
export function accountText(account: AccountInfo): string {
  return account.name === '' || account.name === account.handle ? `@${account.handle}` : `${account.name} (@${account.handle})`;
}

