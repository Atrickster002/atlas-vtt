import type { Http } from './account/http.ts';
import { RedirectRefused } from './account/redirects.ts';
import { readCreated, type CreatedTable } from './createdTable.ts';

/** Why no table was made: the relay's status (0: not reached) and a sentence for the GM. */
export interface CreateFailure {
  readonly status: number;
  readonly message: string;
}

/** Said when the relay's address answers with a redirect: the token is not sent after it. */
export const REDIRECT_TEXT = 'This server sends requests on to another address. Atlas does not send your sign-in there.';

/** Asks the relay for a new table for the account signed in with `token`; the relay asks the account service whether it may host. */
export async function createTable(http: Http, origin: string, token: string): Promise<CreatedTable | CreateFailure> {
  try {
    const response = await http({ url: `${origin}/api/tables`, method: 'POST', authorization: `Bearer ${token}` });
    const created = readCreated(response.status, response.json);
    return typeof created === 'string' ? { status: response.status, message: created } : created;
  } catch (error) {
    return { status: 0, message: error instanceof RedirectRefused ? REDIRECT_TEXT : 'The server could not be reached.' };
  }
}
