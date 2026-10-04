import type { App } from 'obsidian';
import { DEFAULT_DICE_RULES, collectionDiceRules } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import { AssetService } from './AssetService';
import { mapCollectionSettings, systemPresetsOf } from './mapCollectionRules';

/** Dice rules of the collection that holds the map; the default rules without one. */
export function mapDiceRules(app: App, mapPath: string | null | undefined): DiceRules {
  const settings = mapCollectionSettings(app, mapPath);
  return settings ? collectionDiceRules(settings, systemPresetsOf(app)) : { ...DEFAULT_DICE_RULES };
}

/** Dice rules of a collection (a statblock pane's); the default rules without one. */
export function diceRulesOfCollection(app: App, collectionId: string | null): DiceRules {
  if (!collectionId) return { ...DEFAULT_DICE_RULES };
  return collectionDiceRules(AssetService.getInstance(app).getCollectionSettings(collectionId), systemPresetsOf(app));
}
