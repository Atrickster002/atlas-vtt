import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { shownLine } from './chat.ts';
import { isRecord } from './shape.ts';

/** The most properties a loot card carries, and the longest a name, a short value and a description may be. */
export const MAX_LOOT_PROPERTIES = 16;
export const MAX_LOOT_NAME = 120;
export const MAX_LOOT_VALUE = 200;
export const MAX_LOOT_DESCRIPTION = 1500;

/** An item the GM handed out, as players read it: the text of its card, never where it came from. */
export interface LootCard {
  readonly name: string;
  readonly rarity?: string;
  readonly type?: string;
  readonly price?: string;
  readonly description?: string;
  readonly properties: readonly { readonly label: string; readonly value: string }[];
}

/** An image the GM showed the players: by hash with its size, never its file's name or path. */
export interface ShownImageRef {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** An optional text of a card: undefined where it is absent, null where it cannot be read. */
function optionalText(value: unknown, max: number): string | null | undefined {
  return value === undefined ? undefined : shownLine(value, max);
}

/** A loot card as the client reads it, or null for anything malformed. */
export function parseLootCard(value: unknown): LootCard | null {
  if (!isRecord(value) || !Array.isArray(value.properties) || value.properties.length > MAX_LOOT_PROPERTIES) return null;
  const name = shownLine(value.name, MAX_LOOT_NAME);
  const rarity = optionalText(value.rarity, MAX_LOOT_VALUE);
  const type = optionalText(value.type, MAX_LOOT_VALUE);
  const price = optionalText(value.price, MAX_LOOT_VALUE);
  const description = optionalText(value.description, MAX_LOOT_DESCRIPTION);
  if (name === null || rarity === null || type === null || price === null || description === null) return null;
  const properties: { label: string; value: string }[] = [];
  for (const property of value.properties) {
    if (!isRecord(property)) return null;
    const label = shownLine(property.label, MAX_LOOT_NAME);
    const text = shownLine(property.value, MAX_LOOT_DESCRIPTION);
    if (label === null || text === null) return null;
    properties.push({ label, value: text });
  }
  return {
    name, properties,
    ...(rarity !== undefined && { rarity }),
    ...(type !== undefined && { type }),
    ...(price !== undefined && { price }),
    ...(description !== undefined && { description }),
  };
}

/** A shown image as a log entry carries it, or null for anything malformed. */
export function parseShownImageRef(value: Record<string, unknown>): ShownImageRef | null {
  const image = parseAsset(value.image);
  if (image === null || !isSide(value.width) || !isSide(value.height)) return null;
  return { image, width: value.width, height: value.height };
}
