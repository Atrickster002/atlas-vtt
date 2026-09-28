import type { LootItem } from './lootItem';
import { rarityTone, type RarityTone } from './lootRarity';

export interface LootProperty {
  label: string;
  value: string;
}

/**
 * One rolled item, copied out of its note so the history outlives edits to it.
 * Its price already names the collection's currency, e.g. "500 thorns".
 */
export type LootDraw = Omit<LootItem, 'id'> & {
  /** This draw; an item drawn twice gives two draws. */
  id: string;
  /** The item note. */
  notePath: string;
};

export interface LootRollOptions {
  count: number;
  /** Rarities switched off: their items are never drawn. Items without a known rarity always may be. */
  excluded?: ReadonlySet<RarityTone>;
  /** Named after plain-number prices, e.g. "thorns". */
  currency?: string | undefined;
  random?: () => number;
}

/** A price as players read it: plain numbers get thousands separators and the currency. */
export function formatPrice(price: string, currency: string | undefined): string {
  if (!/^\d+(\.\d+)?$/.test(price.trim())) return price;
  const amount = Number(price).toLocaleString('en-US');
  return currency?.trim() ? `${amount} ${currency.trim()}` : amount;
}

/** Each item once, however many ticked views hold it. */
function unique(items: readonly LootItem[]): LootItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function drawable(items: readonly LootItem[], excluded: ReadonlySet<RarityTone>): LootItem[] {
  return unique(items).filter((item) => {
    const tone = rarityTone(item.rarity);
    return !tone || !excluded.has(tone);
  });
}

/** How many items can be drawn with these rarities switched off. */
export function countDrawable(items: readonly LootItem[], excluded: ReadonlySet<RarityTone>): number {
  return drawable(items, excluded).length;
}

/** How many items of each rarity there are. */
export function countByRarity(items: readonly LootItem[]): Map<RarityTone, number> {
  const counts = new Map<RarityTone, number>();
  for (const item of unique(items)) {
    const tone = rarityTone(item.rarity);
    if (tone) counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }
  return counts;
}

function toDraw(item: LootItem, currency: string | undefined): LootDraw {
  const { id, price, ...rest } = item;
  return { ...rest, id: crypto.randomUUID(), notePath: id, ...(price && { price: formatPrice(price, currency) }) };
}

/** Draws `count` items; every drawable item has the same chance, and may come up more than once. */
export function rollLoot(items: readonly LootItem[], { count, excluded = new Set(), currency, random = Math.random }: LootRollOptions): LootDraw[] {
  const pool = drawable(items, excluded);
  const draws: LootDraw[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const item = pool[Math.floor(random() * pool.length)];
    if (item) draws.push(toDraw(item, currency));
  }
  return draws;
}
