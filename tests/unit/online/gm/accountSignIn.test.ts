// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AccountControl } from '../../../../src/app/online/gm/account/AccountControl.ts';
import { accountText, planText } from '../../../../src/app/online/gm/account/accountView.ts';
import { DeviceSignIn } from '../../../../src/app/online/gm/account/deviceFlow.ts';
import type { HttpRequest, HttpResponse } from '../../../../src/app/online/gm/account/http.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { ACCOUNTS_ORIGIN as ACCOUNTS, RELAY_ORIGIN as RELAY } from '../../../../src/app/online/gm/servers.ts';

const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };

/** A clock the test moves; timers fire in order as it passes them. */
class FakeTimers implements Timers {
  private time = 0;
  private next = 1;
  private readonly due = new Map<number, { at: number; run: () => void }>();

  now(): number {
    return this.time;
  }

  setTimer(run: () => void, ms: number): number {
    const id = this.next++;
    this.due.set(id, { at: this.time + ms, run });
    return id;
  }

  clearTimer(id: number): void {
    this.due.delete(id);
  }

  get pending(): number {
    return this.due.size;
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await flush();
      const [id, timer] = [...this.due].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      if (id === undefined || timer === undefined || timer.at > end) break;
      this.due.delete(id);
      this.time = timer.at;
      timer.run();
    }
    this.time = end;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** The account service and the relay as the companion meets them: answers by path, every request kept. */
class FakeServers {
  readonly requests: HttpRequest[] = [];
  reachable = true;
  /** What polling answers, one entry per poll (the last repeats). */
  polls: HttpResponse[] = [{ status: 400, json: { error: 'authorization_pending' } }];
  me: HttpResponse = { status: 200, json: { account: MARA, access: null } };
  redeem: HttpResponse = { status: 200, json: { access: { plan: 'beta', maxPlayers: 12, endsAt: null } } };

  readonly http = (request: HttpRequest): Promise<HttpResponse> => {
    this.requests.push(request);
    if (!this.reachable) return Promise.reject(new Error('offline'));
    const path = request.url.replace(/^https?:\/\/[^/]+/, '');
    if (path === '/auth/device/code') return Promise.resolve({ status: 200, json: { device_code: 'dev-code', user_code: 'ABCDEFGH', verification_uri_complete: 'http://site.test/device?user_code=ABCDEFGH', expires_in: 600, interval: 5 } });
    if (path === '/auth/device/token') return Promise.resolve(this.polls.length > 1 ? this.polls.shift() ?? this.polls[0]! : this.polls[0]!);
    if (path === '/auth/sign-out') return Promise.resolve({ status: 200, json: { success: true } });
    if (path === '/api/me') return Promise.resolve(this.me);
    if (path === '/api/invites/redeem') return Promise.resolve(this.redeem);
    if (path === '/api/me/data') return Promise.resolve(request.method === 'DELETE' ? { status: 200, json: { deleted: true } } : { status: 200, json: { userId: MARA.id, grants: [] } });
    return Promise.resolve({ status: 404, json: null });
  };

  paths(): string[] {
    return this.requests.map((request) => `${request.method} ${request.url.replace(/^https?:\/\/[^/]+/, '')}`);
  }
}

function setup(createKey = false): { control: AccountControl; servers: FakeServers; timers: FakeTimers; tokens: { value: string | null }; opened: string[]; notices: string[] } {
  const servers = new FakeServers();
  const timers = new FakeTimers();
  const tokens = { value: null as string | null };
  const opened: string[] = [];
  const notices: string[] = [];
  const control = new AccountControl({
    http: servers.http,
    timers,
    tokens: { get: () => tokens.value, set: (token) => (tokens.value = token), clear: () => (tokens.value = null) },
    createKey: () => createKey,
    openUrl: (url) => void opened.push(url),
    notify: (text) => void notices.push(text),
  });
  return { control, servers, timers, tokens, opened, notices };
}

describe('the device sign-in', () => {
  it('opens the approve page, polls at the server\'s interval, slows down when asked, and keeps the token', async () => {
    const { control, servers, timers, tokens, opened } = setup();
    expect(control.view()).toEqual({ kind: 'signed-out', notice: null });
    servers.polls = [
      { status: 400, json: { error: 'authorization_pending' } },
      { status: 400, json: { error: 'slow_down' } },
      { status: 400, json: { error: 'authorization_pending' } },
      { status: 200, json: { access_token: 'bearer-token', token_type: 'Bearer' } },
    ];
    const done = control.signIn();
    await flush();
    expect(opened).toEqual(['http://site.test/device?user_code=ABCDEFGH']);
    expect(control.view()).toEqual({ kind: 'waiting', userCode: 'ABCDEFGH' });
    // The code request names only the client: never a user, a scope or a token.
    expect(servers.requests[0]).toEqual({ url: `${ACCOUNTS}/auth/device/code`, method: 'POST', form: { client_id: 'atlas-obsidian' } });

    const polls = (): number => servers.paths().filter((path) => path.endsWith('/device/token')).length;
    await timers.advance(4999);
    expect(polls()).toBe(0);
    await timers.advance(1);
    expect(polls()).toBe(1);
    await timers.advance(5000);
    expect(polls()).toBe(2); // slow_down: the next poll waits 10 s
    await timers.advance(9999);
    expect(polls()).toBe(2);
    await timers.advance(1);
    expect(polls()).toBe(3);
    await timers.advance(10_000);
    await done;
    expect(tokens.value).toBe('bearer-token');
    expect(control.view()).toEqual({ kind: 'no-access', account: MARA, redeeming: false, redeemError: null });
    expect(servers.requests.at(-1)).toMatchObject({ url: `${RELAY}/api/me`, authorization: 'Bearer bearer-token' });
    expect(timers.pending).toBe(0);
    // The token never travels in a URL.
    expect(servers.requests.some((request) => request.url.includes('bearer-token'))).toBe(false);
  });

  it('ends on a declined or an expired code, and when cancelled', async () => {
    const declined = setup();
    declined.servers.polls = [{ status: 400, json: { error: 'access_denied' } }];
    const first = declined.control.signIn();
    await declined.timers.advance(5000);
    await first;
    expect(declined.control.view()).toEqual({ kind: 'signed-out', notice: 'declined' });

    const expired = setup();
    const second = expired.control.signIn();
    await expired.timers.advance(600_000);
    await second;
    expect(expired.control.view()).toEqual({ kind: 'signed-out', notice: 'timed-out' });
    expect(expired.servers.paths().filter((path) => path.endsWith('/device/token')).length).toBeLessThanOrEqual(120);

    const cancelled = setup();
    const third = cancelled.control.signIn();
    await cancelled.timers.advance(5000);
    cancelled.control.reopenSignIn();
    cancelled.control.cancelSignIn();
    await third;
    expect(cancelled.opened).toHaveLength(2);
    expect(cancelled.control.view()).toEqual({ kind: 'signed-out', notice: null });
    expect(cancelled.timers.pending).toBe(0);
  });

  it('says the service cannot be reached when no code comes, and keeps polling through a dropped connection', async () => {
    const offline = setup();
    offline.servers.reachable = false;
    await offline.control.signIn();
    expect(offline.control.view()).toEqual({ kind: 'signed-out', notice: 'unreachable' });

    const timers = new FakeTimers();
    const servers = new FakeServers();
    servers.polls = [{ status: 400, json: { error: 'authorization_pending' } }, { status: 200, json: { access_token: 'late' } }];
    const flow = new DeviceSignIn({ http: servers.http, timers, origin: ACCOUNTS, openUrl: () => undefined });
    const end = flow.run(() => undefined);
    await timers.advance(5000);
    servers.reachable = false;
    await timers.advance(5000);
    servers.reachable = true;
    await timers.advance(5000);
    expect(await end).toEqual({ kind: 'token', token: 'late' });
  });
});

describe('the signed-in account', () => {
  it('shows what it may host, redeems a key and says why one is refused', async () => {
    const { control, servers, tokens } = setup();
    tokens.value = 'tok';
    expect(control.view()).toEqual({ kind: 'checking' });
    await control.refresh(true);
    expect(control.view()).toMatchObject({ kind: 'no-access' });
    servers.redeem = { status: 400, json: { error: 'expired' } };
    await control.redeem('AAAA-BBBB-CCCC-DDDD');
    expect(control.view()).toMatchObject({ kind: 'no-access', redeemError: 'This key has expired.' });
    servers.redeem = { status: 429, json: { error: 'too-many-tries' } };
    await control.redeem('AAAA-BBBB-CCCC-DDDD');
    expect(control.view()).toMatchObject({ redeemError: 'Too many tries, try again tomorrow.' });
    servers.redeem = { status: 200, json: { access: { plan: 'beta', maxPlayers: 12, endsAt: null } } };
    await control.redeem('AAAA-BBBB-CCCC-DDDD');
    expect(control.view()).toEqual({ kind: 'can-host', account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } });
    expect(servers.requests.find((request) => request.url.endsWith('/redeem'))).toMatchObject({ method: 'POST', json: { key: 'AAAA-BBBB-CCCC-DDDD' }, authorization: 'Bearer tok' });
  });

  it('forgets a token the relay refuses, says running tables go on, and asks again only after a while', async () => {
    const { control, servers, tokens, notices, timers } = setup();
    tokens.value = 'tok';
    await control.refresh(true);
    await control.refresh(false);
    expect(servers.paths().filter((path) => path === 'GET /api/me')).toHaveLength(1);
    await timers.advance(10_000);
    servers.me = { status: 401, json: { error: 'signed-out' } };
    await control.refresh(false);
    expect(tokens.value).toBeNull();
    expect(control.view()).toEqual({ kind: 'signed-out', notice: 'server' });
    expect(notices).toEqual(['You were signed out. Running tables keep going.']);
  });

  it('keeps the token while the service cannot be reached', async () => {
    const { control, servers, tokens } = setup();
    tokens.value = 'tok';
    servers.me = { status: 503, json: { error: 'accounts-unreachable' } };
    await control.refresh(true);
    expect(control.view()).toEqual({ kind: 'unreachable' });
    servers.reachable = false;
    await control.refresh(true);
    expect(control.view()).toEqual({ kind: 'unreachable' });
    expect(tokens.value).toBe('tok');
  });

  it('signs out at the account service with the bearer, and forgets the token even when it cannot be reached', async () => {
    const { control, servers, tokens } = setup();
    tokens.value = 'tok';
    await control.signOut();
    expect(servers.requests.at(-1)).toEqual({ url: `${ACCOUNTS}/auth/sign-out`, method: 'POST', authorization: 'Bearer tok' });
    expect(control.view()).toEqual({ kind: 'signed-out', notice: null });
    tokens.value = 'tok2';
    servers.reachable = false;
    await control.signOut();
    expect(tokens.value).toBeNull();
  });

  it('downloads and deletes the online data, and the owner\'s create key needs no account', async () => {
    const { control, tokens } = setup();
    tokens.value = 'tok';
    expect(JSON.parse((await control.exportData()) ?? '')).toEqual({ userId: MARA.id, grants: [] });
    expect(await control.deleteData()).toBe(true);
    expect(setup(true).control.view()).toEqual({ kind: 'owner' });
  });
});

describe('the account in words', () => {
  it('names the plan and the account', () => {
    expect(planText({ plan: 'beta', maxPlayers: 12, endsAt: null })).toBe('Early access · up to 12 players');
    expect(planText({ plan: 'free', maxPlayers: 2, endsAt: null })).toBe('Free · up to 2 players');
    expect(accountText(MARA)).toBe('Mara (@mara)');
    expect(accountText({ ...MARA, name: 'mara' })).toBe('@mara');
  });
});
