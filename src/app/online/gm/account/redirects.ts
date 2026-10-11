import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { Http } from './http.ts';

/** How long an address has to answer the question; one that takes longer is asked the request itself. */
const PROBE_TIMEOUT_MS = 5_000;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** A request with a token, or with the code a token is handed out for, was not sent, because its address answers with a redirect. */
export class RedirectRefused extends Error {
  constructor(url: string) {
    super(`${new URL(url).origin} answers with a redirect`);
    this.name = 'RedirectRefused';
  }
}

/**
 * Whether an address answers with a redirect. It is asked by Node's own client, which follows none,
 * with a HEAD request that carries no token. An address that gives no answer is no redirect: the
 * request itself then fails the same way.
 */
export function answersWithRedirect(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ask = new URL(url).protocol === 'https:' ? httpsRequest : httpRequest;
      const probe = ask(url, { method: 'HEAD', timeout: PROBE_TIMEOUT_MS }, (response) => {
        response.resume();
        resolve(REDIRECT_STATUSES.has(response.statusCode ?? 0));
      });
      probe.on('timeout', () => probe.destroy());
      probe.on('error', () => resolve(false));
      probe.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * A transport that sends no token to an address that answers with a redirect. Obsidian's `requestUrl`
 * always follows redirects, with the request's headers, and its answer does not say that it did, so
 * the token could reach another origin than the one it was sent to. Each request with a token, and
 * each poll of a sign-in (its device code is what the token is handed out for), therefore asks its
 * address first, and is not sent where the answer is a redirect.
 */
export function refusingRedirects(http: Http, redirects: (url: string) => Promise<boolean>): Http {
  return async (request) => {
    const credential = request.authorization !== undefined || request.form?.device_code !== undefined;
    if (credential && (await redirects(request.url))) throw new RedirectRefused(request.url);
    return http(request);
  };
}
