import { resolveLevel, type SceneLevels } from '../../levels/sceneLevels';
import type { TokenEntity } from '../../types';

/** A token a player put down inside stairs, and the level the stairs took it to. */
export interface StairsTaken {
  readonly tokenId: string;
  readonly level: string;
}

/** What telling which tokens took stairs reads of the shared store. */
export interface LevelsOfTokens {
  objects: { tokens: Record<string, TokenEntity> };
  levels?: SceneLevels;
}

/**
 * The tokens of `ids` that a write put on another level (`placeTokens` takes a token put down inside
 * stairs to the level they lead to), each with that level. Players are shown one level, so such a
 * token leaves their picture.
 */
export function stairsTaken(before: LevelsOfTokens, after: LevelsOfTokens, ids: readonly string[]): StairsTaken[] {
  const levelOf = (state: LevelsOfTokens, id: string): string | null => {
    const token = state.objects.tokens[id];
    return token === undefined ? null : resolveLevel(after.levels, token.level);
  };
  return ids.flatMap((tokenId) => {
    const was = levelOf(before, tokenId);
    const level = levelOf(after, tokenId);
    return was !== null && level !== null && level !== was ? [{ tokenId, level }] : [];
  });
}
