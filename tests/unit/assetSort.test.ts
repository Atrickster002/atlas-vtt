import { describe, expect, it } from 'vitest';
import { resolveSortOption, sortAssets, sortOptionsFor } from '../../src/app/packages/components/asset-manager/utils/assetSort';
import type { AnyAsset, EncounterAsset, MapAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';

const token = (name: string, extra: Partial<TokenAsset> = {}): TokenAsset => ({
  id: name, name, type: 'tokens', imageUrl: '', modifiedAt: 0, ...extra,
});
const map = (name: string, mapFilePath: string): MapAsset => ({
  id: name, name, type: 'maps', imageUrl: '', mapFilePath, modifiedAt: 0,
});
const encounter = (name: string, difficulty?: EncounterAsset['difficulty']): EncounterAsset => ({
  id: name, name, type: 'encounters', tokens: [], tokenPreviews: [], modifiedAt: 0, ...(difficulty && { difficulty }),
});
const names = (assets: AnyAsset[]): string[] => assets.map((asset) => asset.name);

describe('sortAssets', () => {
  it('sorts names naturally and reverses the whole order when descending', () => {
    const assets = [token('Goblin 10'), token('goblin 2'), token('Bandit')];
    expect(names(sortAssets(assets, 'name', 'asc'))).toEqual(['Bandit', 'goblin 2', 'Goblin 10']);
    expect(names(sortAssets(assets, 'name', 'desc'))).toEqual(['Goblin 10', 'goblin 2', 'Bandit']);
  });

  it('sorts by the date an asset was last modified', () => {
    const assets = [token('Old', { modifiedAt: 1 }), token('New', { modifiedAt: 3 }), token('Middle', { modifiedAt: 2 })];
    expect(names(sortAssets(assets, 'date', 'asc'))).toEqual(['Old', 'Middle', 'New']);
    expect(names(sortAssets(assets, 'date', 'desc'))).toEqual(['New', 'Middle', 'Old']);
  });

  it('sorts characters by size, then those with a statblock first, then by name', () => {
    const assets = [
      token('Dragon', { size: 4 }),
      token('Wolf'),
      token('Rat', { size: 0.5 }),
      token('Bandit', { statblockPath: 'Bandit.md' }),
      token('Archer'),
    ];
    expect(names(sortAssets(assets, 'type', 'asc'))).toEqual(['Rat', 'Bandit', 'Archer', 'Wolf', 'Dragon']);
  });

  it('sorts maps by file format and encounters by difficulty', () => {
    const maps = [map('Cave', 'a/cave.webp'), map('Keep', 'a/keep.jpg'), map('Bog', 'a/bog.PNG')];
    expect(names(sortAssets(maps, 'type', 'asc'))).toEqual(['Keep', 'Bog', 'Cave']);
    const encounters = [encounter('Ambush', 'deadly'), encounter('Patrol'), encounter('Rats', 'easy'), encounter('Ogre', 'hard')];
    expect(names(sortAssets(encounters, 'type', 'asc'))).toEqual(['Rats', 'Ogre', 'Ambush', 'Patrol']);
  });

  it('leaves the input untouched', () => {
    const assets = [token('B'), token('A')];
    sortAssets(assets, 'name', 'asc');
    expect(names(assets)).toEqual(['B', 'A']);
  });
});

describe('sort options', () => {
  it('offers no type sort on scenes and falls back to name there', () => {
    expect(sortOptionsFor('scenes')).toEqual(['name', 'date']);
    expect(resolveSortOption('type', 'scenes')).toBe('name');
    expect(resolveSortOption('type', 'tokens')).toBe('type');
  });
});

describe('sorting characters by rating', () => {
  const ratings: Record<string, { scale: number; value: number }> = {
    Ogre: { scale: 0, value: 2 },
    Goblin: { scale: 0, value: 0.25 },
    Dragon: { scale: 0, value: 10 },
    Burrower: { scale: 2, value: 1 },
    Knight: { scale: 1, value: 5 },
  };
  const tokens = ['Ogre', 'Innkeeper', 'Goblin', 'Burrower', 'Dragon', 'Knight', 'Adept'].map((name) => token(name));
  const ratingOf = (asset: AnyAsset): { scale: number; value: number } | null => ratings[asset.name] ?? null;
  const names = (assets: AnyAsset[]): string[] => assets.map((asset) => asset.name);

  it('is offered for characters only', () => {
    expect(sortOptionsFor('tokens')).toContain('rating');
    expect(sortOptionsFor('maps')).not.toContain('rating');
    expect(resolveSortOption('rating', 'maps')).toBe('name');
  });

  it('groups by scale, orders each scale by value and puts characters without a rating last either way', () => {
    expect(names(sortAssets(tokens, 'rating', 'asc', ratingOf))).toEqual(['Goblin', 'Ogre', 'Dragon', 'Knight', 'Burrower', 'Adept', 'Innkeeper']);
    expect(names(sortAssets(tokens, 'rating', 'desc', ratingOf))).toEqual(['Dragon', 'Ogre', 'Goblin', 'Knight', 'Burrower', 'Adept', 'Innkeeper']);
  });

  it('falls back to names while no ratings are known', () => {
    expect(names(sortAssets(tokens, 'rating', 'asc'))).toEqual(['Adept', 'Burrower', 'Dragon', 'Goblin', 'Innkeeper', 'Knight', 'Ogre']);
  });
});
