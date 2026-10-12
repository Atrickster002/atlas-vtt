import type { BookQuest } from '../../protocol/index.ts';
import type { PlayedCharacter } from './characters.ts';
import type { WorldMapFile } from './worldMap.ts';

/** What one player was last sent of their book, to compare with what they would be sent now. */
export interface SentBook {
  /** The character the book is of, by collection and key; empty for none. */
  readonly book: string;
  readonly map: string;
  /** The quests as the campaign handed them on: the same array while no quest changed, so compared by identity. */
  readonly quests: readonly BookQuest[];
  readonly sheet: string;
}

/** A book without quests: a player without a character gets none. */
export const NO_QUESTS: readonly BookQuest[] = [];

/** What a player is sent now of their book, to compare with what they were sent last. */
export function sentOf(character: PlayedCharacter | null, worldMap: WorldMapFile | null, quests: readonly BookQuest[]): SentBook {
  return {
    book: character === null ? '' : `${character.collection}\n${character.key}`,
    map: worldMap === null ? '' : JSON.stringify(worldMap.map),
    quests: character === null ? NO_QUESTS : quests,
    sheet: JSON.stringify(character?.sheet ?? null),
  };
}
