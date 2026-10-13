import type { Claim } from '../protocol/index.ts';
import type { TokenEntity } from '../../types';
import type { MineSource } from './mineShare.ts';

/** Who owns which token and which tokens are player tokens (`Ownership`). Only the GM gives a token to a player. */
export interface SeatSource extends MineSource {
  /** What players may know of a token: a player token, or the GM's. */
  claimOf(mapPath: string, tokenId: string, token: TokenEntity): Claim;
}
