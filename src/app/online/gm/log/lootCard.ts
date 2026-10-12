import { MAX_LOOT_DESCRIPTION, MAX_LOOT_NAME, MAX_LOOT_PROPERTIES, MAX_LOOT_VALUE, shownLine, type LootCard } from '../../protocol/index.ts';
import type { LootDraw } from '../../../loot/lootRoller';

/** A text cut to `max` characters, the last one an ellipsis where it was longer, then cleaned as players are sent it. */
function bounded(value: string, max: number): string | null {
  const characters = [...value];
  return shownLine(characters.length <= max ? value : `${characters.slice(0, max - 1).join('')}…`, max);
}

/** An optional text of an item, bounded and cleaned; absent where it reads as nothing. */
function text<K extends string>(key: K, value: string | undefined, max: number): Partial<Record<K, string>> {
  const shown = value === undefined ? null : bounded(value, max);
  return shown === null ? {} : ({ [key]: shown } as Record<K, string>);
}

/**
 * A handed-out item as players are sent it: the text of its card (name, rarity, type, price,
 * description and properties), cleaned and bounded, never its note or the base it was rolled from.
 * Null for an item without a name that shows.
 */
export function lootCardOf(draw: LootDraw): LootCard | null {
  const name = bounded(draw.name, MAX_LOOT_NAME);
  if (name === null) return null;
  const properties = draw.properties.flatMap((property) => {
    const label = bounded(property.label, MAX_LOOT_NAME);
    const value = bounded(property.value, MAX_LOOT_DESCRIPTION);
    return label === null || value === null ? [] : [{ label, value }];
  }).slice(0, MAX_LOOT_PROPERTIES);
  return {
    name, properties,
    ...text('rarity', draw.rarity, MAX_LOOT_VALUE),
    ...text('type', draw.type, MAX_LOOT_VALUE),
    ...text('price', draw.price, MAX_LOOT_VALUE),
    ...text('description', draw.description, MAX_LOOT_DESCRIPTION),
  };
}
