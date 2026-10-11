import { requestUrl } from 'obsidian';
import { bodyOf, type Http } from './http.ts';
import { answersWithRedirect, refusingRedirects } from './redirects.ts';

/** Obsidian's `requestUrl`, which no browser's CORS rules hold back. */
const requestUrlHttp: Http = async (request) => {
  const { body, contentType } = bodyOf(request);
  const response = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.authorization === undefined ? {} : { Authorization: request.authorization },
    ...(body === undefined ? {} : { body }),
    ...(contentType === undefined ? {} : { contentType }),
    throw: false,
  });
  let json: unknown = null;
  try {
    json = response.json;
  } catch {
    json = null;
  }
  return { status: response.status, json };
};

/** How online play reaches the account service and the relay: `requestUrl`, with no token sent to an address that redirects. */
export const obsidianHttp: Http = refusingRedirects(requestUrlHttp, answersWithRedirect);
