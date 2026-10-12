/**
 * Game system rules as the settings dialogs show and check them: what the rules read as where they
 * follow their preset (dice, initiative, senses, lights), and whether they can be saved.
 */

import { areRangeBandsValid } from '../grid/measurementFormat';
import { isUnitDistance } from '../grid/unitDistance';
import { savedResources } from '../resources/resourceDefinitions';
import type { ResourceDefinition } from '../resources/resourceTypes';
import type { CollectionGridDefaults } from '../types/collectionSettingsTypes';
import type { DiceRules } from '../types/diceRulesTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import type { SenseDefinition } from '../types/senseTypes';
import type { SystemPreset, SystemRules } from '../types/systemPresetTypes';
import { collectionDiceRules, isValidDiceRules } from './diceRules';
import { collectionInitiativeRules, isValidInitiativeRules } from './initiativeRules';
import { collectionLightPresets } from './lightPresetRules';
import type { RulesSettings } from './mapRules';
import { sensesAreValid } from './senseEditing';
import { collectionSenses } from './senseRules';
import { DEFAULT_GRID_DEFAULTS } from './systemRules';

export interface RulesView {
  dice: DiceRules;
  /** The initiative rules as typed, else the system's. */
  initiative: InitiativeRules;
  /** The initiative rules of the game system alone; typing them again stores none of the rules' own. */
  systemInitiative: InitiativeRules;
  senses: readonly SenseDefinition[];
  /** The senses of the game system alone; an edit that ends there again stores none of the rules' own. */
  systemSenses: readonly SenseDefinition[];
  /** The rules as a preset holds them, to compare with the presets and to save as one. */
  systemRules: SystemRules;
  /** Whether every part can be saved. */
  isValid: boolean;
}

/** Whether what was typed is the system's rules to the letter; a roll with a space or another case is kept as typed. */
export function isSameAsTyped(typed: InitiativeRules, system: InitiativeRules): boolean {
  return typed.mode === system.mode && typed.firstSide === system.firstSide && typed.roll === system.roll;
}

/** Rules as a dialog holds them: every part may be unset, or given as undefined. */
export type EditedRules = { readonly [K in keyof RulesSettings]?: RulesSettings[K] | undefined } & Pick<RulesSettings, 'conditions'>;

/** `settings` as the dialogs show them, read with `presets`. */
export function viewOfRules(settings: EditedRules, presets: readonly SystemPreset[]): RulesView {
  const gridDefaults: CollectionGridDefaults = settings.gridDefaults ?? DEFAULT_GRID_DEFAULTS;
  const resources: readonly ResourceDefinition[] = settings.resources ?? [];
  const dice = collectionDiceRules(settings, presets);
  const systemInitiative = collectionInitiativeRules({ systemPresetId: settings.systemPresetId }, presets);
  // The rules as they are typed, half a roll included; only stored rules are parsed.
  const initiative = settings.initiative ?? systemInitiative;
  const senses = collectionSenses(settings, presets);
  const isValid = areRangeBandsValid(gridDefaults.abstractRangeBands)
    && isUnitDistance(gridDefaults.unitDistance)
    && isValidDiceRules(dice)
    && isValidInitiativeRules(initiative)
    && sensesAreValid(senses)
    // A resource without a name or a statblock field could never show.
    && resources.every((resource) => resource.name.trim() !== '' && resource.field.trim() !== '');
  return {
    dice,
    initiative,
    systemInitiative,
    senses,
    systemSenses: collectionSenses({ systemPresetId: settings.systemPresetId }, presets),
    systemRules: {
      gridDefaults,
      conditions: settings.conditions,
      ...(settings.defaultWidgets && { defaultWidgets: settings.defaultWidgets }),
      dice,
      initiative,
      resources: savedResources(resources),
      ...(settings.defaultTokenVision && { defaultTokenVision: settings.defaultTokenVision }),
      senses,
      lightPresets: collectionLightPresets(settings, presets),
    },
    isValid,
  };
}
