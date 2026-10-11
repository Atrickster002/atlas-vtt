import { requestUrl } from 'obsidian';
import { bodyOf, type Http } from './http.ts';

/** Obsidian's `requestUrl`, which no browser's CORS rules hold back. */
export const obsidianHttp: Http = async (request) => {
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
