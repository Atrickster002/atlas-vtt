import type { TokenAsset } from '../services/AssetService';

/** What a placed token carries that names the library token it was placed from. */
export interface PlacedTokenSource {
  assetId?: string;
  imagePath: string;
}

/** Whether the library token is one of the players' characters. */
export const isPlayerCharacter = (asset: Pick<TokenAsset, 'playerCharacter'>): boolean => asset.playerCharacter === true;

/**
 * The library token a placed token was placed from: the one its `assetId` names, else (a token
 * placed before tokens carried one, or whose record was copied under a new id) the one whose art it
 * shows. Null when no library token is known for it.
 */
export function libraryTokenOf(token: PlacedTokenSource, tokens: readonly TokenAsset[]): TokenAsset | null {
  if (token.assetId !== undefined) {
    const named = tokens.find((asset) => asset.id === token.assetId);
    if (named) return named;
  }
  return tokens.find((asset) => asset.imagePath === token.imagePath) ?? null;
}
