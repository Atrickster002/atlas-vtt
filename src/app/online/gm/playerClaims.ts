import type { Claim, PlayerClaim } from '../protocol/index.ts';
import type { TokenEntity } from '../../types';
import type { MineSource } from './mineShare.ts';
import { MoveRate } from './moveCheck.ts';

/** Who owns which token and which tokens players may claim (`Ownership`). */
export interface SeatSource extends MineSource {
  isPlayerToken(mapPath: string, tokenId: string, token: TokenEntity): boolean;
  /** What players may know of a token: open to claim, taken, or the GM's. */
  claimOf(mapPath: string, tokenId: string, token: TokenEntity): Claim;
  /** Gives a token nobody has to a known player; false when it cannot. */
  claim(tokenId: string, playerId: string): boolean;
}

/** What a player's claim is checked against. */
export interface ClaimContext {
  /** The shared scene whose token list players were last sent, or null while none is. */
  readonly scene: string | null;
  /** The map path of the shared tab's scene, by which the GM's player tokens are kept. */
  readonly mapPath: string | null;
  /** The GM id of a token in that list, by the id players know it by. */
  listedToken(alias: string): string | undefined;
  readonly tokens: Readonly<Record<string, TokenEntity>>;
}

export type ClaimVerdict =
  | { readonly ok: true; readonly tokenId: string }
  | { readonly ok: false; readonly reason: 'scene' | 'token' | 'not-player' | 'taken' };

/**
 * Whether the GM takes a player's claim: it names the shared scene and a token of the list players
 * see that is not hidden now, a player token nobody has. Only the GM gives a token back.
 */
export function checkClaim(message: PlayerClaim, context: ClaimContext, seats: SeatSource): ClaimVerdict {
  if (context.scene === null || context.mapPath === null || message.scene !== context.scene) return { ok: false, reason: 'scene' };
  const tokenId = context.listedToken(message.id);
  const token = tokenId === undefined ? undefined : context.tokens[tokenId];
  if (tokenId === undefined || token === undefined || token.isHidden === true) return { ok: false, reason: 'token' };
  if (!seats.isPlayerToken(context.mapPath, tokenId, token)) return { ok: false, reason: 'not-player' };
  return seats.ownerOf(tokenId) === undefined ? { ok: true, tokenId } : { ok: false, reason: 'taken' };
}

/**
 * Players' claims: each checked (`checkClaim`, a rate per player) and applied to the
 * owners, which sends everyone the new list and each player their own tokens. One message at a time,
 * so of two claims of one token the first wins and the second finds it taken.
 */
export class PlayerClaims {
  private readonly rate = new MoveRate();
  private readonly seats: SeatSource;
  private readonly context: () => ClaimContext;
  private readonly now: () => number;

  constructor(seats: SeatSource, context: () => ClaimContext, now: () => number) {
    this.seats = seats;
    this.context = context;
    this.now = now;
  }

  /** Applies a player's claim; false when it was refused. */
  receive(from: string, message: PlayerClaim): boolean {
    if (!this.rate.take(from, this.now())) return false;
    const verdict = checkClaim(message, this.context(), this.seats);
    if (!verdict.ok) return false;
    return this.seats.claim(verdict.tokenId, from);
  }
}
