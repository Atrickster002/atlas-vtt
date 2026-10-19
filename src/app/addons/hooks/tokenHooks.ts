import type { Character } from '../../types';

export interface TokenAddonHooks {
  /**
   * Whether the player view draws `token`'s resource bars (HP and the like);
   * undefined leaves the default (shown wherever a resource is visible to players).
   * The first add-on with an answer decides.
   */
  playerSeesResources?(token: Partial<Character>): boolean | undefined;
}
