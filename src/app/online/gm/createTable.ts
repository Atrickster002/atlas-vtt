import type { Http } from './account/http.ts';
import { readCreated, type CreatedTable } from './createdTable.ts';

/** Why no table was made: the relay's status (0: not reached) and a sentence for the GM. */
export interface CreateFailure {
  readonly status: number;
  readonly message: string;
}

/** Asks the relay for a new table, with the create key or the GM's account token. */
export async function createTable(http: Http, origin: string, bearer: string): Promise<CreatedTable | CreateFailure> {
  try {
    const response = await http({ url: `${origin}/api/tables`, method: 'POST', authorization: `Bearer ${bearer}` });
    const created = readCreated(response.status, response.json);
    return typeof created === 'string' ? { status: response.status, message: created } : created;
  } catch {
    return { status: 0, message: 'The server could not be reached.' };
  }
}
