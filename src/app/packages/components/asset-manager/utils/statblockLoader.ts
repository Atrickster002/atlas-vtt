import type { App as ObsidianApp } from 'obsidian';
import { difficultyLabel, scalarText } from '../../../../creatures/statblockRating';
import type { ResourceDefinition, ResourceValue } from '../../../../resources/resourceTypes';
import { startingResources } from '../../../../resources/statblockResourceValues';
import { readStatblock } from '../../../../statblocks/resolve/readStatblock';

export interface StatblockOverrides {
  name?: string;
  difficulty?: string;
  /** Starting values of the collection's resources the statblock has a field for. */
  resources?: Record<string, ResourceValue>;
}

/**
 * Resolves what a token takes from the statblock of a linked note: its name,
 * difficulty and the starting values of the collection's resources. A native
 * statblock's template says which fields hold its hit points and rating.
 */
export async function loadStatblockOverrides(
  app: ObsidianApp,
  statblockPath: string,
  definitions: readonly ResourceDefinition[],
): Promise<StatblockOverrides> {
  const overrides: StatblockOverrides = {};

  try {
    const statblock = await readStatblock(app, statblockPath);
    if (!statblock) return overrides;
    const { fields, meanings } = statblock;

    const resources = startingResources(fields, definitions, meanings);
    if (Object.keys(resources).length > 0) overrides.resources = resources;

    const difficulty = difficultyLabel(fields, meanings);
    if (difficulty !== undefined) overrides.difficulty = difficulty;

    const name = scalarText(fields.name);
    if (name !== null) overrides.name = name;
  } catch (error) {
    console.error('[statblockLoader] Failed to load statblock data:', error);
  }

  return overrides;
}
