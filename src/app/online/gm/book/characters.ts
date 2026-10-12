import type { BookCharacter } from '../../protocol/index.ts';
import type { ShownRollToken } from '../../../services/playerRollSource';
import type { TokenEntity } from '../../../types';
import type { BookScene } from './bookScene.ts';

/** The character a player plays, whose book is theirs for as long. */
export interface PlayedCharacter {
  readonly collection: string;
  /** The character in its collection: its token's artwork path. It names the book and is never sent. */
  readonly key: string;
  /** The token the character was read from. */
  readonly tokenId: string;
  /** The sheet as last read from the scene. */
  readonly sheet: BookCharacter;
}

/** Who owns the tokens and who is at the table, and how a token becomes a sheet. */
export interface CharacterInputs {
  ownerOf(tokenId: string): string | undefined;
  /** Whether the table still knows the player. */
  isKnown(player: string): boolean;
  /** The sheet of a token the players' frame shows, or null when none can be made of it. */
  sheet(shown: ShownRollToken, token: TokenEntity): BookCharacter | null;
}

const bookOf = (character: Pick<PlayedCharacter, 'collection' | 'key'>): string => `${character.collection}\n${character.key}`;

/**
 * Which character each player of the table plays: the first token they own in the shared scene, in
 * the scene's order (the token the GM's player list shows them by), as the players' frame shows it.
 * A character stays its player's for the table while the scene shows none of their tokens (another
 * scene, the token hidden or out of sight), with the sheet it last had. It ends when its token is
 * in the shared scene and no longer theirs (the GM gave it to someone else or took it back), when the table no longer knows the player, or when they play another character.
 * A book is open to one player at a time: a token with the artwork of a character someone else
 * plays is passed over, so two players never read one book.
 */
export class Characters {
  private readonly played = new Map<string, PlayedCharacter>();

  of(player: string): PlayedCharacter | null {
    return this.played.get(player) ?? null;
  }

  /** Reads the shared scene: who plays which character now. */
  update(scene: BookScene, inputs: CharacterInputs): void {
    for (const [player, character] of [...this.played]) {
      const givenAway = Object.hasOwn(scene.tokens, character.tokenId) && inputs.ownerOf(character.tokenId) !== player;
      if (givenAway || !inputs.isKnown(player)) this.played.delete(player);
    }
    const holders = new Map([...this.played].map(([player, character]) => [bookOf(character), player]));
    const owned = Object.keys(scene.tokens).filter((tokenId) => inputs.ownerOf(tokenId) !== undefined);
    const shown = scene.shown(owned);
    const settled = new Set<string>();
    for (const tokenId of owned) {
      const owner = inputs.ownerOf(tokenId);
      const token = scene.tokens[tokenId];
      if (owner === undefined || token === undefined || settled.has(owner) || !inputs.isKnown(owner)) continue;
      const before = this.played.get(owner);
      const seen = shown.get(tokenId);
      if (seen?.imagePath === undefined) {
        // Their character's token, not shown now: it stays as it was, before any further token of theirs.
        if (before?.tokenId === tokenId) settled.add(owner);
        continue;
      }
      const character = { collection: scene.collection, key: seen.imagePath };
      const holder = holders.get(bookOf(character));
      const sheet = holder === undefined || holder === owner ? inputs.sheet(seen, token) : null;
      if (sheet === null) continue;
      if (before !== undefined) holders.delete(bookOf(before));
      holders.set(bookOf(character), owner);
      this.played.set(owner, { ...character, tokenId, sheet });
      settled.add(owner);
    }
  }
}
