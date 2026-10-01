import { useEffect, useState } from 'react';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import { parseSenseDefinitions } from '../../../gameSystems/senseValidation';
import { DEFAULT_GRID_DEFAULTS, rulesOfPreset, vanillaSystemSettings } from '../../../gameSystems/systemRules';
import { parseCreatureFilters, parseHiddenCreatureFilters } from '../../../creatures/creatureFilterDefinitions';
import type { AssetService } from '../../../services/AssetService';
import type {
  CollectionGridDefaults,
  CollectionSettings,
  ConditionDefinition,
} from '../../../types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../../../types/creatureFilterTypes';
import type { DiceRules } from '../../../types/diceRulesTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';
import type { SenseDefinition } from '../../../types/senseTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { changedTokenBars, tokenBarsOf, type TokenBars } from '../../../services/collectionTokenBars';

export interface CollectionSettingsDraft {
  gridDefaults: CollectionGridDefaults;
  setGridDefaults: (gridDefaults: CollectionGridDefaults) => void;
  defaultWidgets: Record<string, boolean>;
  setDefaultWidgets: (defaultWidgets: Record<string, boolean>) => void;
  /** What new tokens start with; undefined when the collection sets nothing. */
  defaultTokenVision: TokenVisionDefaults | undefined;
  setDefaultTokenVision: (vision: TokenVisionDefaults | undefined) => void;
  /** Unset while the collection takes the senses of its preset; read with `collectionSenses`. */
  senses: readonly SenseDefinition[] | undefined;
  conditions: ConditionDefinition[];
  setConditions: (conditions: ConditionDefinition[]) => void;
  /** Unset while the collection takes the dice of its preset; read with `collectionDiceRules`. */
  dice: DiceRules | undefined;
  setDice: (dice: DiceRules) => void;
  /** The collection's filters on fields of its own. */
  customCreatureFilters: CreatureFilterDefinition[];
  setCustomCreatureFilters: (filters: CreatureFilterDefinition[]) => void;
  /** Ids of Atlas' own filters switched off for the collection. */
  hiddenCreatureFilters: string[];
  setHiddenCreatureFilters: (ids: string[]) => void;
  systemPresetId: string | undefined;
  setSystemPresetId: (presetId: string | undefined) => void;
  lootBases: string[];
  setLootBases: (lootBases: string[]) => void;
  lootCurrency: string;
  setLootCurrency: (lootCurrency: string) => void;
  applyPreset: (preset: SystemPreset) => void;
  /** Leaves the collection without a game system, as if it had never been set up. */
  clearSystem: () => void;
  /** The draft as the settings to save. */
  toSettings: () => Partial<CollectionSettings>;
  /** The resource bars saving turns on or off in every scene, when the draft changed them. */
  tokenBarChanges: () => TokenBars;
}

/** The collection's settings as edited in the modal; nothing is written until the caller saves. */
export function useCollectionSettingsDraft(
  assetService: AssetService | null,
  collectionId: string,
  isOpen: boolean,
): CollectionSettingsDraft {
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(() => structuredClone(DEFAULT_GRID_DEFAULTS));
  const [defaultWidgets, setDefaultWidgets] = useState<Record<string, boolean>>({});
  const [defaultTokenVision, setDefaultTokenVision] = useState<TokenVisionDefaults | undefined>(undefined);
  const [senses, setSenses] = useState<readonly SenseDefinition[] | undefined>(undefined);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [dice, setDice] = useState<DiceRules | undefined>(undefined);
  const [systemPresetId, setSystemPresetId] = useState<string | undefined>(undefined);
  const [lootBases, setLootBases] = useState<string[]>([]);
  const [lootCurrency, setLootCurrency] = useState('');
  const [loadedDefaultWidgets, setLoadedDefaultWidgets] = useState<Record<string, boolean> | undefined>(undefined);
  const [customCreatureFilters, setCustomCreatureFilters] = useState<CreatureFilterDefinition[]>([]);
  const [hiddenCreatureFilters, setHiddenCreatureFilters] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen || !assetService) return;
    const settings = assetService.getCollectionSettings(collectionId);
    setGridDefaults(settings.gridDefaults ?? structuredClone(DEFAULT_GRID_DEFAULTS));
    setDefaultWidgets(settings.defaultWidgets ?? {});
    setDefaultTokenVision(settings.defaultTokenVision);
    setSenses(parseSenseDefinitions(settings.senses));
    setConditions(settings.conditions ?? []);
    setDice(settings.dice);
    setSystemPresetId(settings.systemPresetId);
    setLootBases(settings.lootBases ?? []);
    setLootCurrency(settings.lootCurrency ?? '');
    setLoadedDefaultWidgets(settings.defaultWidgets);
    setCustomCreatureFilters(parseCreatureFilters(settings.customCreatureFilters));
    setHiddenCreatureFilters(parseHiddenCreatureFilters(settings.hiddenCreatureFilters));
  }, [isOpen, collectionId, assetService]);

  const applyPreset = (preset: SystemPreset): void => {
    const rules = rulesOfPreset(preset);
    setGridDefaults(rules.gridDefaults);
    setConditions(rules.conditions);
    setDefaultWidgets(rules.defaultWidgets);
    setDice(rules.dice);
    setDefaultTokenVision(rules.defaultTokenVision);
    // The collection reads its preset's senses until they are edited.
    setSenses(undefined);
    setSystemPresetId(preset.id);
  };

  const clearSystem = (): void => {
    const vanilla = vanillaSystemSettings();
    setGridDefaults(vanilla.gridDefaults);
    setConditions(vanilla.conditions);
    setDefaultWidgets(vanilla.defaultWidgets);
    setDice(vanilla.dice);
    setDefaultTokenVision(vanilla.defaultTokenVision);
    setSenses(vanilla.senses);
    setSystemPresetId(undefined);
  };

  const toSettings = (): Partial<CollectionSettings> => ({
    gridDefaults,
    defaultWidgets,
    defaultTokenVision: hasVisionDefaults(defaultTokenVision) ? defaultTokenVision : undefined,
    senses,
    conditions,
    ...(dice && { dice: { ...dice, defaultRoll: dice.defaultRoll.trim() } }),
    // Trimmed, with the field as label where none was typed.
    customCreatureFilters: parseCreatureFilters(customCreatureFilters),
    hiddenCreatureFilters,
    systemPresetId,
    lootBases,
    lootCurrency: lootCurrency.trim() || undefined,
  });

  return {
    gridDefaults, setGridDefaults,
    defaultWidgets, setDefaultWidgets,
    defaultTokenVision, setDefaultTokenVision,
    senses,
    conditions, setConditions,
    dice, setDice,
    customCreatureFilters, setCustomCreatureFilters,
    hiddenCreatureFilters, setHiddenCreatureFilters,
    systemPresetId, setSystemPresetId,
    lootBases, setLootBases,
    lootCurrency, setLootCurrency,
    applyPreset, clearSystem, toSettings,
    tokenBarChanges: () => changedTokenBars(tokenBarsOf(loadedDefaultWidgets), tokenBarsOf(defaultWidgets)),
  };
}
