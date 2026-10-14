import type { TokenEntity } from '../types';
import { linkLandings } from '../levels/levelLinks';
import type { SceneLevels } from '../levels/sceneLevels';
import type { LevelLink } from '../types/sceneLevelTypes';

const layerOf = (token: TokenEntity): number => token.layer ?? 0;

/**
 * Puts the tokens on top of every other token of the map, in the order they lie in among
 * themselves: the token put on a square last covers the ones that were there. Tokens that
 * already lie above all others stay as they are. Changes `tokens` in place (a store draft).
 */
export function raiseTokens(tokens: Record<string, TokenEntity>, ids: readonly string[]): void {
  const picked = new Set(ids);
  const raised: TokenEntity[] = [];
  let below = -Infinity;
  for (const token of Object.values(tokens)) {
    if (picked.has(token.id)) raised.push(token);
    else below = Math.max(below, layerOf(token));
  }
  if (raised.every((token) => layerOf(token) > below)) return;

  raised.sort((a, b) => layerOf(a) - layerOf(b));
  raised.forEach((token, index) => {
    token.layer = below + 1 + index;
  });
}

/** Where a token is put down. */
export interface TokenPlace {
  id: string;
  x: number;
  y: number;
}

/** What putting tokens down writes: the tokens, and the flag that tells spatial audio a token moved; and the stairs it reads. */
export interface PlacedTokensState {
  objects: { tokens: Record<string, TokenEntity>; levelLinks?: Record<string, LevelLink> | undefined };
  levels?: SceneLevels;
  _audioDirty: boolean;
}

/**
 * Puts tokens down: each at its place, all of them on top of every other token (`raiseTokens`),
 * and flags the move for spatial audio. A token put down inside stairs (`linkLandings`) that lead
 * to one level goes to that level, at the same place, in the same write; where they offer several,
 * it stays and the caller may offer the choice (`linkChoice`). Changes only what the scene saves and
 * undoes (the tokens' places, order and levels) and the audio flag; letting go of held tokens is
 * pointer state, which `dropTokens` does. Tokens not listed keep their objects. Changes `state` in
 * place (a store draft); returns nothing, so a recipe may hand its call on.
 */
export function placeTokens(state: PlacedTokensState, positions: readonly TokenPlace[]): void {
  const { tokens } = state.objects;
  const landings = linkLandings(state, positions);
  for (const { id, x, y } of positions) {
    const token = tokens[id];
    if (token) {
      token.x = x;
      token.y = y;
    }
  }
  for (const { tokenId, targets } of landings) {
    const token = tokens[tokenId];
    if (token && targets.length === 1) token.level = targets[0];
  }
  raiseTokens(tokens, positions.map(({ id }) => id));
  state._audioDirty = true;
}
