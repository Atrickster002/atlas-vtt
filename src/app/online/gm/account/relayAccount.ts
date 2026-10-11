import { field, type Http } from './http.ts';

/** The signed-in account as the dock names it. */
export interface AccountInfo {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
}

/** What the account may host: its plan and seats. */
export interface HostAccess {
  readonly plan: string;
  readonly maxPlayers: number;
  readonly endsAt: number | null;
}

/** Why the relay did not answer: the token is no longer signed in, or the account service or relay cannot be reached. */
export type AccountTrouble = 'signed-out' | 'unreachable';

export type MeAnswer = { readonly kind: 'me'; readonly account: AccountInfo; readonly access: HostAccess | null } | { readonly kind: AccountTrouble | 'unavailable' };

export type RedeemRefusal = 'invalid' | 'used' | 'expired' | 'too-many-tries' | 'already-has-access' | 'rate-limited';

export type RedeemAnswer = { readonly kind: 'ok'; readonly access: HostAccess } | { readonly kind: 'refused'; readonly reason: RedeemRefusal } | { readonly kind: AccountTrouble };

const REFUSALS: readonly RedeemRefusal[] = ['invalid', 'used', 'expired', 'too-many-tries', 'already-has-access'];

function accessOf(json: unknown): HostAccess | null {
  const plan = field(json, 'plan');
  const maxPlayers = field(json, 'maxPlayers');
  const endsAt = field(json, 'endsAt');
  if (typeof plan !== 'string' || typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 1) return null;
  return { plan, maxPlayers, endsAt: typeof endsAt === 'number' ? endsAt : null };
}

function accountOf(json: unknown): AccountInfo | null {
  const id = field(json, 'id');
  const handle = field(json, 'handle');
  const name = field(json, 'name');
  return typeof id === 'string' && typeof handle === 'string' && typeof name === 'string' ? { id, handle, name } : null;
}

/** The trouble a status stands for, or null for an answer to read. */
function troubleOf(status: number): AccountTrouble | null {
  if (status === 401) return 'signed-out';
  return status === 0 || status >= 500 ? 'unreachable' : null;
}

/**
 * The GM's account at the relay: `/api/me`, redeeming an invite key, and the account's online data.
 * Each call sends the token in the `Authorization` header only.
 */
export class RelayAccount {
  private readonly http: Http;
  private readonly origin: string;
  private readonly token: string;

  constructor(http: Http, origin: string, token: string) {
    this.http = http;
    this.origin = origin;
    this.token = token;
  }

  async me(): Promise<MeAnswer> {
    const response = await this.call('GET', '/api/me');
    const trouble = troubleOf(response.status) ?? (response.status === 429 ? 'unreachable' : null);
    if (trouble !== null) return { kind: trouble };
    const account = accountOf(field(response.json, 'account'));
    if (response.status !== 200 || account === null) return { kind: 'unavailable' };
    return { kind: 'me', account, access: accessOf(field(response.json, 'access')) };
  }

  async redeem(key: string): Promise<RedeemAnswer> {
    const response = await this.call('POST', '/api/invites/redeem', { key });
    const trouble = troubleOf(response.status);
    if (trouble !== null) return { kind: trouble };
    const access = accessOf(field(response.json, 'access'));
    if (response.status === 200 && access !== null) return { kind: 'ok', access };
    const error = field(response.json, 'error');
    const reason = REFUSALS.find((refusal) => refusal === error) ?? (response.status === 429 ? 'rate-limited' : 'invalid');
    return { kind: 'refused', reason };
  }

  /** The account's online data as JSON text, or the trouble that kept it. */
  async exportData(): Promise<{ readonly kind: 'data'; readonly text: string } | { readonly kind: AccountTrouble }> {
    const response = await this.call('GET', '/api/me/data');
    if (response.status === 200) return { kind: 'data', text: JSON.stringify(response.json, null, 2) };
    return { kind: troubleOf(response.status) ?? 'unreachable' };
  }

  async deleteData(): Promise<{ readonly kind: 'deleted' } | { readonly kind: AccountTrouble }> {
    const response = await this.call('DELETE', '/api/me/data');
    if (response.status === 200) return { kind: 'deleted' };
    return { kind: troubleOf(response.status) ?? 'unreachable' };
  }

  private async call(method: 'GET' | 'POST' | 'DELETE', path: string, json?: unknown): Promise<{ readonly status: number; readonly json: unknown }> {
    try {
      return await this.http({ url: `${this.origin}${path}`, method, authorization: `Bearer ${this.token}`, ...(json === undefined ? {} : { json }) });
    } catch {
      return { status: 0, json: null };
    }
  }
}

/** Signs a token out at the account service; whether it answered (the token is forgotten either way). */
export async function signOutToken(http: Http, origin: string, token: string): Promise<boolean> {
  try {
    const response = await http({ url: `${origin}/auth/sign-out`, method: 'POST', authorization: `Bearer ${token}` });
    return response.status === 200;
  } catch {
    return false;
  }
}
