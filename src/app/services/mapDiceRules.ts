import type { App } from 'obsidian';
import { DEFAULT_DICE_RULES, collectionDiceRules } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import { systemPresetsOf } from './mapCollectionRules';
import { mapRules } from './mapRules';

/** Dice rules the map plays by (`mapRules`); the default rules without any. */
export function mapDiceRules(app: App, mapPath: string | null | undefined): DiceRules {
  const { settings } = mapRules(app, mapPath);
  return settings ? collectionDiceRules(settings, systemPresetsOf(app)) : { ...DEFAULT_DICE_RULES };
}
