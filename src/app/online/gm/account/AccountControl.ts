import type { Timers } from '../companionTimers.ts';
import { ACCOUNTS_ORIGIN, RELAY_ORIGIN } from '../servers.ts';
import { accountView, SERVER_SIGNED_OUT_TEXT, redeemText, UNREACHABLE_TEXT, type AccountFacts, type AccountView, type SignedOutNotice } from './accountView.ts';
import { DeviceSignIn } from './deviceFlow.ts';
import type { Http } from './http.ts';
import { RelayAccount, signOutToken, type AccountInfo, type HostAccess } from './relayAccount.ts';
import type { TokenStore } from './tokenStore.ts';

export interface AccountPorts {
  readonly http: Http;
  readonly timers: Timers;
  readonly tokens: TokenStore;
  /** The create key is set: the owner hosts without an account. */
  readonly createKey: () => boolean;
  readonly openUrl: (url: string) => void;
  /** Tells the GM something outside the dock (Obsidian's `Notice`). */
  readonly notify: (text: string) => void;
}

/** The part of the account control the dock uses. */
export type AccountApi = Pick<AccountControl, 'view' | 'onChange' | 'refresh' | 'signIn' | 'cancelSignIn' | 'reopenSignIn' | 'signOut' | 'redeem'>;

/** How long an answer of `/api/me` is fresh enough that opening the dock does not ask again. */
const FRESH_MS = 10_000;

/**
 * The GM's Atlas account: device sign-in, the token in secret storage, what `/api/me` says it may
 * host, invite keys, sign-out and the account's online data. A 401 anywhere clears the token and
 * says so; tables already running never depend on it. The dock and the settings read `view()`.
 */
export class AccountControl {
  private readonly ports: AccountPorts;
  private flow: DeviceSignIn | null = null;
  private userCode: string | null = null;
  private me: { readonly account: AccountInfo; readonly access: HostAccess | null } | 'unreachable' | null = null;
  private checkedAt = Number.NEGATIVE_INFINITY;
  private checking: Promise<void> | null = null;
  private notice: SignedOutNotice = null;
  private redeeming = false;
  private redeemError: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(ports: AccountPorts) {
    this.ports = ports;
  }

  view(): AccountView {
    return accountView(this.facts());
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The token tables are asked for with, or null while signed out. */
  token(): string | null {
    return this.ports.tokens.get();
  }

  /** Asks the relay what the account may host, unless it was asked moments ago (`force` asks anyway). */
  refresh(force = false): Promise<void> {
    const token = this.token();
    if (token === null) return Promise.resolve();
    if (!force && this.me !== null && this.me !== 'unreachable' && this.ports.timers.now() - this.checkedAt < FRESH_MS) return Promise.resolve();
    this.checking ??= this.check(token).finally(() => (this.checking = null));
    return this.checking;
  }

  /** Starts a device sign-in: the approve page opens in the browser, and the dock shows the code. */
  async signIn(): Promise<void> {
    if (this.flow !== null) return;
    const flow = new DeviceSignIn({ http: this.ports.http, timers: this.ports.timers, origin: ACCOUNTS_ORIGIN, openUrl: this.ports.openUrl });
    this.flow = flow;
    this.userCode = null;
    this.notice = null;
    this.changed();
    const end = await flow.run((code) => {
      this.userCode = code.userCode;
      this.changed();
    });
    if (this.flow !== flow) return;
    this.flow = null;
    this.userCode = null;
    if (end.kind === 'token') {
      try {
        this.ports.tokens.set(end.token);
      } catch {
        this.ports.notify('Obsidian cannot keep the sign-in on this device: its secure storage is not available.');
        void signOutToken(this.ports.http, ACCOUNTS_ORIGIN, end.token);
        return this.changed();
      }
      this.me = null;
      this.changed();
      return this.refresh(true);
    }
    this.notice = end.kind === 'cancelled' ? null : end.kind;
    this.changed();
  }

  /** Opens the approve page again. */
  reopenSignIn(): void {
    this.flow?.reopen();
  }

  cancelSignIn(): void {
    this.flow?.cancel();
  }

  /** Signs this device's session out at the account service and forgets the token. */
  async signOut(): Promise<void> {
    const token = this.token();
    this.forget(null);
    if (token !== null) await signOutToken(this.ports.http, ACCOUNTS_ORIGIN, token);
  }

  /** The server refused the token: it is forgotten, and the GM hears that running tables go on. */
  signedOutByServer(): void {
    if (this.token() === null) return;
    this.forget('server');
    this.ports.notify(SERVER_SIGNED_OUT_TEXT);
  }

  async redeem(key: string): Promise<void> {
    const account = this.relayAccount();
    if (account === null || this.redeeming) return;
    this.redeeming = true;
    this.redeemError = null;
    this.changed();
    const answer = await account.redeem(key).finally(() => (this.redeeming = false));
    if (answer.kind === 'ok') {
      if (this.me !== null && this.me !== 'unreachable') this.me = { ...this.me, access: answer.access };
    } else if (answer.kind === 'signed-out') {
      return this.signedOutByServer();
    } else {
      this.redeemError = answer.kind === 'refused' ? redeemText(answer.reason) : UNREACHABLE_TEXT;
    }
    this.changed();
  }

  /** The account's online data as JSON text, or null (the GM was told why). */
  async exportData(): Promise<string | null> {
    const answer = await this.relayAccount()?.exportData();
    if (answer?.kind === 'data') return answer.text;
    this.trouble(answer?.kind ?? 'signed-out');
    return null;
  }

  /** Deletes the account's online data; its access ends with it. Whether it was deleted. */
  async deleteData(): Promise<boolean> {
    const answer = await this.relayAccount()?.deleteData();
    if (answer?.kind !== 'deleted') {
      this.trouble(answer?.kind ?? 'signed-out');
      return false;
    }
    await this.refresh(true);
    return true;
  }

  private async check(token: string): Promise<void> {
    const answer = await new RelayAccount(this.ports.http, RELAY_ORIGIN, token).me();
    if (this.token() !== token) return;
    if (answer.kind === 'signed-out') return this.signedOutByServer();
    this.me = answer.kind === 'me' ? { account: answer.account, access: answer.access } : 'unreachable';
    this.checkedAt = this.ports.timers.now();
    if (answer.kind === 'me' && answer.access !== null) this.redeemError = null;
    this.changed();
  }

  private trouble(kind: 'signed-out' | 'unreachable'): void {
    if (kind === 'signed-out') this.signedOutByServer();
    else this.ports.notify(UNREACHABLE_TEXT);
  }

  private relayAccount(): RelayAccount | null {
    const token = this.token();
    return token === null ? null : new RelayAccount(this.ports.http, RELAY_ORIGIN, token);
  }

  private forget(notice: SignedOutNotice): void {
    this.ports.tokens.clear();
    this.me = null;
    this.notice = notice;
    this.redeemError = null;
    this.changed();
  }

  private facts(): AccountFacts {
    return {
      createKey: this.ports.createKey(),
      signingIn: this.flow !== null,
      userCode: this.userCode,
      token: this.token() !== null,
      me: this.me,
      notice: this.notice,
      redeeming: this.redeeming,
      redeemError: this.redeemError,
    };
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
