import { MAX_BOOK_TITLE, MAX_ITEM_PROPERTIES, MAX_ITEM_TEXT, MAX_ITEM_VALUE, parseBookItem, type BookItem } from '../../protocol/index.ts';
import { rarityTone } from '../../../loot/lootRarity';
import type { LootDraw } from '../../../loot/lootRoller';
import { clippedLine, clippedText } from './bookTexts.ts';

/** What an item is called whose name holds nothing a book shows. */
const UNNAMED = 'Unnamed item';

/**
 * A rolled item as a player's book holds it: its texts only, each shortened to what a book takes
 * (a long description is cut, not refused), markdown left as the text it is. The note it came from
 * and the base it was rolled on are the GM's and never part of it. Null when it cannot be told.
 */
export function bookItemOf(draw: LootDraw, id: string, at: number): BookItem | null {
  return parseBookItem({
    id,
    at,
    name: clippedLine(draw.name, MAX_BOOK_TITLE) ?? UNNAMED,
    type: clippedLine(draw.type, MAX_BOOK_TITLE),
    rarity: clippedLine(draw.rarity, MAX_BOOK_TITLE),
    tone: rarityTone(draw.rarity) ?? null,
    price: clippedLine(draw.price, MAX_BOOK_TITLE),
    description: clippedText(draw.description, MAX_ITEM_TEXT),
    properties: draw.properties.flatMap((property) => {
      const label = clippedLine(property.label, MAX_BOOK_TITLE);
      const value = clippedLine(property.value, MAX_ITEM_VALUE);
      return label === null || value === null ? [] : [{ label, value }];
    }).slice(0, MAX_ITEM_PROPERTIES),
  });
}
