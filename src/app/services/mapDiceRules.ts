import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { DEFAULT_DICE_RULES, collectionDiceRules } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { SystemPresetService } from './SystemPresetService';

/** Dice rules of the collection that holds the map; the default rules without one. */
export function mapDiceRules(app: App, mapPath: string | null | undefined): DiceRules {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  if (!collectionId) return { ...DEFAULT_DICE_RULES };

  const settings = SettingsService.forApp(app);
  const presets = settings ? new SystemPresetService(settings).list() : BUILT_IN_SYSTEM_PRESETS;
  return collectionDiceRules(assets.getCollectionSettings(collectionId), presets);
}
