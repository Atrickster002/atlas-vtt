import type { BookResourceMessage } from '../../protocol/index.ts';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from '../../../resources/resourceTypes';
import { visibleResources } from '../../../resources/visibleResources';
import type { BookScene } from './bookScene.ts';
import type { PlayedCharacter } from './characters.ts';

/**
 * A player's edit of their own character's resource, checked: written to the token in the shared
 * scene (`token`), or, while that scene holds no token of the character, to the values the played
 * campaign keeps of it (`character`). `current` is as the player sent it; the writer clamps it to
 * the value it writes over.
 */
export type ResourceEdit =
  | { readonly kind: 'token'; readonly from: string; readonly tokenId: string; readonly key: string; readonly current: number }
  | { readonly kind: 'character'; readonly from: string; readonly placed: PlacedTokenSource; readonly key: string; readonly current: number };

/**
 * The value a player may change of a token's resource: one players see (`visibleResources` for the
 * viewer `player`) that is no fixed value. Null for any other key.
 */
export function editableValue(token: ResourceHolder, definitions: readonly ResourceDefinition[], key: string): ResourceValue | null {
  const shown = visibleResources(token, definitions, 'player').find(({ definition }) => definition.key === key);
  return shown === undefined || shown.definition.direction === 'static' ? null : shown.value;
}

/**
 * Whether a player may make an edit, and where it goes; null when it is refused. The player must
 * play a character whose last sheet offers the resource for editing. While the shared scene holds
 * the character's token, that token must still be theirs and the resource one they may change
 * there; otherwise the edit is for the character's values.
 */
export function checkResourceEdit(
  from: string, character: PlayedCharacter | null, scene: BookScene | null, ownerOf: (tokenId: string) => string | undefined, message: BookResourceMessage,
): ResourceEdit | null {
  if (character === null || !character.sheet.resources.some((resource) => resource.key === message.key && resource.editable)) return null;
  const { key, current } = message;
  const token = scene === null ? undefined : scene.tokens[character.tokenId];
  if (scene === null || token === undefined) return { kind: 'character', from, placed: character.placed, key, current };
  if (ownerOf(character.tokenId) !== from || editableValue(token, scene.resources, key) === null) return null;
  return { kind: 'token', from, tokenId: character.tokenId, key, current };
}
