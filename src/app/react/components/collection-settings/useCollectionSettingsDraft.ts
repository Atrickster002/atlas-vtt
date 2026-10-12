import { useEffect, useState } from 'react';
import { parseCreatureFilters, parseHiddenCreatureFilters } from '../../../creatures/creatureFilterDefinitions';
import type { AssetService } from '../../../services/AssetService';
import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../../../types/creatureFilterTypes';
import { useRulesDraft, type RulesDraft } from './useRulesDraft';

/** A collection's settings as edited in its dialog: its game system rules, and what it keeps beside them. */
export interface CollectionSettingsDraft extends Omit<RulesDraft, 'toSettings'> {
  /** The collection's filters on fields of its own. */
  customCreatureFilters: CreatureFilterDefinition[];
  setCustomCreatureFilters: (filters: CreatureFilterDefinition[]) => void;
  /** Ids of Atlas' own filters switched off for the collection. */
  hiddenCreatureFilters: string[];
  setHiddenCreatureFilters: (ids: string[]) => void;
  lootBases: string[];
  setLootBases: (lootBases: string[]) => void;
  lootCurrency: string;
  setLootCurrency: (lootCurrency: string) => void;
  /** The draft as the settings to save. */
  toSettings: () => Partial<CollectionSettings>;
}

/** The collection's settings as edited in the modal; nothing is written until the caller saves. */
export function useCollectionSettingsDraft(
  assetService: AssetService | null,
  collectionId: string,
  isOpen: boolean,
): CollectionSettingsDraft {
  const rules = useRulesDraft();
  const [lootBases, setLootBases] = useState<string[]>([]);
  const [lootCurrency, setLootCurrency] = useState('');
  const [customCreatureFilters, setCustomCreatureFilters] = useState<CreatureFilterDefinition[]>([]);
  const [hiddenCreatureFilters, setHiddenCreatureFilters] = useState<string[]>([]);
  const { load } = rules;

  useEffect(() => {
    if (!isOpen || !assetService) return;
    const settings = assetService.getCollectionSettings(collectionId);
    load(settings);
    setLootBases(settings.lootBases ?? []);
    setLootCurrency(settings.lootCurrency ?? '');
    setCustomCreatureFilters(parseCreatureFilters(settings.customCreatureFilters));
    setHiddenCreatureFilters(parseHiddenCreatureFilters(settings.hiddenCreatureFilters));
  }, [isOpen, collectionId, assetService, load]);

  return {
    ...rules,
    customCreatureFilters, setCustomCreatureFilters,
    hiddenCreatureFilters, setHiddenCreatureFilters,
    lootBases, setLootBases,
    lootCurrency, setLootCurrency,
    toSettings: () => ({
      ...rules.toSettings(),
      // Trimmed, with the field as label where none was typed.
      customCreatureFilters: parseCreatureFilters(customCreatureFilters),
      hiddenCreatureFilters,
      lootBases,
      lootCurrency: lootCurrency.trim() || undefined,
    }),
  };
}
