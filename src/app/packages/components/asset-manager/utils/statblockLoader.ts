import type { App as ObsidianApp } from 'obsidian';
import { resolveLinkedCreature } from '../../../../creatures/linkedCreature';
import { layoutForCreature, type FantasyStatblocksCreature } from '../../../../services/FantasyStatblocksService';
import { getStatblockResources, getResourceUpdate } from '../../../../services/statblockResources';
import type { TokenResourceValue } from '../../../../types';

export interface StatblockOverrides {
  hope?: TokenResourceValue;
  statblockResources?: Record<string, TokenResourceValue>;
  name?: string;
  hp?: { current: number; max: number };
  stress?: number;
  maxStress?: number;
  difficulty?: string;
}

/** A non-empty challenge rating or tier as bestiaries store it, e.g. `5` or `"1/4"`. */
function isLabelValue(value: unknown): value is string | number {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

/** The creature of a linked statblock note; null when the note has none or cannot be read. */
export async function loadLinkedCreature(app: ObsidianApp, statblockPath: string): Promise<FantasyStatblocksCreature | null> {
  try {
    return await resolveLinkedCreature(app, statblockPath);
  } catch (error) {
    console.error('[statblockLoader] Failed to load statblock data:', error);
    return null;
  }
}

/** The token-relevant overrides (HP, difficulty, name) of the creature backing a linked statblock note. */
export function statblockOverridesOf(app: ObsidianApp, creature: FantasyStatblocksCreature | null): StatblockOverrides {
  const overrides: StatblockOverrides = {};
  if (!creature) return overrides;

  try {
    const layout = layoutForCreature(app, creature) ?? { id: '', name: '', blocks: [] };
    for (const resource of getStatblockResources(creature, layout, {})) {
      Object.assign(overrides, getResourceUpdate(overrides, resource, resource.current));
    }

    if (isLabelValue(creature.cr)) {
      overrides.difficulty = `CR ${creature.cr}`;
    } else if (isLabelValue(creature.tier)) {
      overrides.difficulty = `T${creature.tier}`;
    }

    if (creature.name) {
      overrides.name = creature.name;
    }
  } catch (error) {
    console.error('[statblockLoader] Failed to load statblock data:', error);
  }

  return overrides;
}

/**
 * Resolves token-relevant overrides (HP, difficulty, name) from the Fantasy
 * Statblocks creature backing a linked statblock note.
 */
export async function loadStatblockOverrides(
  app: ObsidianApp,
  statblockPath: string
): Promise<StatblockOverrides> {
  return statblockOverridesOf(app, await loadLinkedCreature(app, statblockPath));
}
