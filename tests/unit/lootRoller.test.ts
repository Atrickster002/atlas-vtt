import { describe, expect, it } from 'vitest';
import type { LootItem } from '../../src/app/loot/lootItem';
import { countByRarity, countDrawable, formatPrice, rollLoot } from '../../src/app/loot/lootRoller';
import { rarityTone } from '../../src/app/loot/lootRarity';

/** A random source that returns the given values in turn. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function item(name: string, fields: Partial<LootItem> = {}): LootItem {
  return { id: `Items/${name}.md`, name, source: ['Items', 'Gear'], properties: [], ...fields };
}

const BROADSWORD = item('Broadsword', { price: '100', properties: [{ label: 'Damage', value: 'd8 phy' }] });
const LONGSWORD = item('Longsword');

describe('rollLoot', () => {
  it('draws every item with the same chance', () => {
    const [first] = rollLoot([BROADSWORD, LONGSWORD], { count: 1, random: sequence(0.1) });
    const [second] = rollLoot([BROADSWORD, LONGSWORD], { count: 1, random: sequence(0.9) });
    expect(first?.name).toBe('Broadsword');
    expect(second?.name).toBe('Longsword');
  });

  it('copies the item note, its source and its properties', () => {
    const [draw] = rollLoot([BROADSWORD], { count: 1, random: sequence(0.1) });
    expect(draw).toMatchObject({
      notePath: 'Items/Broadsword.md',
      source: ['Items', 'Gear'],
      name: 'Broadsword',
      price: '100',
      properties: [{ label: 'Damage', value: 'd8 phy' }],
    });
    const [longsword] = rollLoot([LONGSWORD], { count: 1 });
    expect(longsword?.price).toBeUndefined();
  });

  it('names plain-number prices after the currency', () => {
    const [draw] = rollLoot([item('Crown', { price: '1500' })], { count: 1, currency: 'thorns' });
    expect(draw?.price).toBe('1,500 thorns');
  });

  it('counts an item in two ticked views once', () => {
    const inTwoViews = [BROADSWORD, { ...BROADSWORD, source: ['Items', 'Weapons'] }, LONGSWORD];
    expect(countDrawable(inTwoViews, new Set())).toBe(2);
    const [draw] = rollLoot(inTwoViews, { count: 1, random: sequence(0.9) });
    expect(draw?.name).toBe('Longsword');
  });

  it('rolls the requested number of items', () => {
    expect(rollLoot([BROADSWORD, LONGSWORD], { count: 4, random: sequence(0.3, 0.7) })).toHaveLength(4);
  });

  it('rolls nothing without items', () => {
    expect(rollLoot([], { count: 3 })).toEqual([]);
  });
});

describe('formatPrice', () => {
  it('leaves prices that are not plain numbers as they are', () => {
    expect(formatPrice('2 handfuls', 'gold')).toBe('2 handfuls');
    expect(formatPrice('250', undefined)).toBe('250');
    expect(formatPrice('250', '  ')).toBe('250');
  });
});

describe('rarity', () => {
  it('maps onto the classic ladder, whatever the base calls it', () => {
    expect(rarityTone('Uncommon')).toBe('uncommon');
    expect(rarityTone('Very Rare')).toBe('epic');
    expect(rarityTone('**Legendary**')).toBe('legendary');
    expect(rarityTone('Artifact')).toBe('legendary');
    expect(rarityTone('Heirloom')).toBeUndefined();
    expect(rarityTone(undefined)).toBeUndefined();
  });
});

describe('rollLoot with rarities switched off', () => {
  const LADDER = [item('Rope', { rarity: 'Common' }), item('Lantern', { rarity: 'Uncommon' }), item('Glowing Rings', { rarity: 'Rare' })];
  const PEBBLE = item('Pebble');

  it('never draws items of a switched-off rarity', () => {
    const draws = rollLoot(LADDER, { count: 30, excluded: new Set(['common', 'rare'] as const), random: Math.random });
    expect(new Set(draws.map((draw) => draw.name))).toEqual(new Set(['Lantern']));
  });

  it('keeps items without a known rarity whatever is switched off', () => {
    const draws = rollLoot([PEBBLE], { count: 3, excluded: new Set(['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) });
    expect(draws.map((draw) => draw.name)).toEqual(['Pebble', 'Pebble', 'Pebble']);
  });

  it('counts the items of each rarity and those left to draw', () => {
    expect(countByRarity([...LADDER, PEBBLE])).toEqual(new Map([['common', 1], ['uncommon', 1], ['rare', 1]]));
    expect(countDrawable([...LADDER, PEBBLE], new Set(['common'] as const))).toBe(3);
    expect(countDrawable(LADDER, new Set(['common', 'uncommon', 'rare'] as const))).toBe(0);
  });
});
