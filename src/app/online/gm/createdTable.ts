import { MAX_PLAYERS, TABLE_CODE_PATTERN } from '../protocol/index.ts';

/** A table the relay created: its code (in the join link), the host secret (only ever in the GM's hello) and its seats. */
export interface CreatedTable {
  readonly code: string;
  readonly secret: string;
  /** The players the table seats at once, by the GM's plan. */
  readonly maxPlayers: number;
}

/** The seats a relay answered with; a relay from before plans seats `MAX_PLAYERS`. */
export function seatsOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PLAYERS ? value : MAX_PLAYERS;
}

/** The created table from the relay's answer, or a sentence saying why there is none. */
export function readCreated(status: number, body: unknown): CreatedTable | string {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 401) return 'You were signed out. Running tables keep going.';
  if (status === 403) return fields.error === 'no-access' ? 'Online play is in early access. Redeem an invite key first.' : 'The server refused the create key.';
  if (status === 429) return 'Too many tries. Try again in a minute.';
  if (status === 503 && fields.error === 'accounts-unreachable') return 'Can’t reach Atlas sign-in right now.';
  if (status !== 201) return `The server could not create a table (${status}).`;
  const { code, secret } = fields;
  if (typeof code !== 'string' || !TABLE_CODE_PATTERN.test(code) || typeof secret !== 'string' || secret.length < 32) return 'The server answered with something that is no table.';
  return { code, secret, maxPlayers: seatsOf(fields.maxPlayers) };
}
