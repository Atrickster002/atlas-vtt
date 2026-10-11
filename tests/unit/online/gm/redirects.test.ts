// @vitest-environment node
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTable } from '../../../../src/app/online/gm/createTable.ts';
import type { Http, HttpRequest } from '../../../../src/app/online/gm/account/http.ts';
import { answersWithRedirect, RedirectRefused, refusingRedirects } from '../../../../src/app/online/gm/account/redirects.ts';

/** Two local test servers: one that answers some paths with a redirect to the other, which notes every request it gets. */
let relay: Server;
let elsewhere: Server;
let relayAddress = '';
let elsewhereOrigin = '';
const reached: IncomingMessage[] = [];
const asked: { method: string; url: string; authorization: string | undefined }[] = [];

const listen = (server: Server): Promise<string> => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
const close = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

beforeAll(async () => {
  elsewhere = createServer((request, response) => {
    reached.push(request);
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
  elsewhereOrigin = await listen(elsewhere);
  relay = createServer((request, response) => {
    asked.push({ method: request.method ?? '', url: request.url ?? '', authorization: request.headers.authorization });
    const status = /^\/moved\/(\d{3})$/.exec(request.url ?? '')?.[1];
    if (status !== undefined) response.writeHead(Number(status), { Location: `${elsewhereOrigin}/api/tables` }).end();
    else response.writeHead(request.url === '/unchanged' ? 304 : 405).end();
  });
  relayAddress = await listen(relay);
});

afterAll(async () => {
  await close(relay);
  await close(elsewhere);
});

/** A transport that follows redirects with every header, as Obsidian's `requestUrl` may: what the guard stands in front of. */
const following: Http = async (request) => {
  let url = request.url;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(url, { method: request.method, redirect: 'manual', headers: request.authorization === undefined ? {} : { Authorization: request.authorization } });
    const next = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || next === null) return { status: response.status, json: await response.json().catch(() => null) as unknown };
    url = next;
  }
  return { status: 0, json: null };
};

describe('an address that answers with a redirect', () => {
  it('is told from one that does not, by a request that carries no token and follows nothing', async () => {
    for (const status of [301, 302, 303, 307, 308]) expect(await answersWithRedirect(`${relayAddress}/moved/${status}`), String(status)).toBe(true);
    expect(await answersWithRedirect(`${relayAddress}/api/tables`)).toBe(false);
    expect(await answersWithRedirect(`${relayAddress}/unchanged`)).toBe(false);
    expect(asked.every((request) => request.method === 'HEAD' && request.authorization === undefined)).toBe(true);
    expect(reached).toEqual([]);
  });

  it('is no redirect while it gives no answer: the request itself then fails', async () => {
    const gone = createServer();
    const origin = await listen(gone);
    await close(gone);
    expect(await answersWithRedirect(`${origin}/api/me`)).toBe(false);
    expect(await answersWithRedirect('not an address')).toBe(false);
  });

  it('is sent no token, so none follows the redirect to another origin', async () => {
    asked.length = 0;
    const guarded = refusingRedirects(following, answersWithRedirect);
    const request: HttpRequest = { url: `${relayAddress}/moved/307`, method: 'POST', authorization: 'Bearer account-token' };
    // Unguarded, the token arrives at the other origin: this is what must not happen.
    await following(request);
    expect(reached.map((arrived) => arrived.headers.authorization)).toEqual(['Bearer account-token']);
    reached.length = 0;
    asked.length = 0;
    await expect(guarded(request)).rejects.toBeInstanceOf(RedirectRefused);
    // Nor the code a sign-in's token is handed out for.
    await expect(guarded({ url: `${relayAddress}/moved/307`, method: 'POST', form: { device_code: 'dev-code', client_id: 'atlas-obsidian' } })).rejects.toBeInstanceOf(RedirectRefused);
    expect(reached).toEqual([]);
    // The redirecting address itself was only asked without the token.
    expect(asked).toEqual([{ method: 'HEAD', url: '/moved/307', authorization: undefined }, { method: 'HEAD', url: '/moved/307', authorization: undefined }]);
  });

  it('still gets requests that carry no token, and an address that does not redirect gets its token', async () => {
    asked.length = 0;
    const guarded = refusingRedirects(following, answersWithRedirect);
    expect(await guarded({ url: `${relayAddress}/api/tables`, method: 'POST', authorization: 'Bearer account-token' })).toMatchObject({ status: 405 });
    expect(asked.at(-1)).toEqual({ method: 'POST', url: '/api/tables', authorization: 'Bearer account-token' });
    const probes = asked.length;
    await guarded({ url: `${relayAddress}/auth/device/code`, method: 'POST', form: { client_id: 'atlas-obsidian' } });
    expect(asked).toHaveLength(probes + 1);
  });

  it('makes no table, and the GM is told why', async () => {
    const sent: HttpRequest[] = [];
    const guarded = refusingRedirects((request) => (sent.push(request), Promise.resolve({ status: 201, json: null })), () => Promise.resolve(true));
    expect(await createTable(guarded, 'https://play.example', 'account-token')).toEqual({ status: 0, message: 'This server sends requests on to another address. Atlas does not send your sign-in there.' });
    expect(sent).toEqual([]);
  });
});
