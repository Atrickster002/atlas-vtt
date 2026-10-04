import React from 'react';
import type { App } from 'obsidian';
import { collectionConeAngle } from '../../../gameSystems/coneAngle';
import { collectionLightPresets } from '../../../gameSystems/lightPresetRules';
import { editedSenses } from '../../../gameSystems/senseEditing';
import { resourceFieldSuggestions } from '../../../resources/resourceFieldSuggestions';
import type { StatblockTemplate, TemplateId } from '../../../statblocks/model/templateTypes';
import { collectionStatblockRoles } from '../../../statblocks/roles/collectionStatblockRoles';
import { StatblocksTab } from '../../../statblocks/settings/StatblocksTab';
import type { DiceRules } from '../../../types/diceRulesTypes';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { SenseDefinition } from '../../../types/senseTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import type { useSystemPresets } from '../../hooks/useSystemPresets';
import { ConditionsTab } from './ConditionsTab';
import { CreatureFiltersTab } from './CreatureFiltersTab';
import { DefaultWidgetsTab } from './DefaultWidgetsTab';
import { DiceTab } from './DiceTab';
import { GridMeasurementTab } from './GridMeasurementTab';
import { LootTab } from './LootTab';
import { ResourcesTab } from './ResourcesTab';
import { offersTab, type CollectionSettingsTab, type FeatureSwitches } from './settingsTabs';
import { SystemTab } from './SystemTab';
import type { CollectionCreatures } from './useCollectionCreatures';
import { savedResources, type CollectionSettingsDraft } from './useCollectionSettingsDraft';
import { VisionTab } from './VisionTab';

/** The rules the dialog reads from its draft, with what the collection's game system gives. */
export interface DraftRules {
  dice: DiceRules;
  initiative: InitiativeRules;
  systemInitiative: InitiativeRules;
  senses: readonly SenseDefinition[];
  systemSenses: readonly SenseDefinition[];
}

interface SettingsTabContentProps {
  tab: CollectionSettingsTab;
  app: App | undefined;
  collectionId: string;
  draft: CollectionSettingsDraft;
  systemPresets: ReturnType<typeof useSystemPresets>;
  rules: DraftRules;
  features: FeatureSwitches;
  creatures: CollectionCreatures;
  roleTemplates: readonly StatblockTemplate[];
  canSave: boolean;
  onDeletePreset: (preset: SystemPreset) => Promise<void>;
  /** Saves the settings, closes the dialog and opens a template; the Statblocks tab offers Edit only with it. */
  onEditTemplate?: ((templateId: TemplateId) => void) | undefined;
}

/** Whether what was typed is the system's rules to the letter; a roll with a space or another case is kept as typed. */
function isSameAsTyped(typed: InitiativeRules, system: InitiativeRules): boolean {
  return typed.mode === system.mode && typed.firstSide === system.firstSide && typed.roll === system.roll;
}

/** The open tab of the collection settings dialog, editing the dialog's draft. */
export function SettingsTabContent({
  tab, app, collectionId, draft, systemPresets, rules, features, creatures, roleTemplates, canSave, onDeletePreset, onEditTemplate,
}: SettingsTabContentProps): React.ReactElement | null {
  const { presets, service } = systemPresets;
  const { gridDefaults, conditions } = draft;
  if (!offersTab(tab, features)) return null;

  switch (tab) {
    case 'system':
      return service && (
        <SystemTab
          service={service}
          presets={presets}
          rules={{
            gridDefaults,
            conditions,
            defaultWidgets: draft.defaultWidgets,
            dice: rules.dice,
            initiative: rules.initiative,
            resources: savedResources(draft.resources),
            ...(draft.defaultTokenVision && { defaultTokenVision: draft.defaultTokenVision }),
            senses: rules.senses,
            lightPresets: collectionLightPresets(draft, presets),
            statblockRoles: collectionStatblockRoles(draft, presets),
          }}
          presetId={draft.systemPresetId}
          onApplyPreset={draft.applyPreset}
          onPresetIdChange={draft.setSystemPresetId}
          onDeletePreset={onDeletePreset}
        />
      );
    case 'dice':
      return <DiceTab dice={rules.dice} onChange={draft.setDice} />;
    case 'grid':
      return (
        <GridMeasurementTab
          gridDefaults={gridDefaults}
          coneAngle={collectionConeAngle(gridDefaults, draft.systemPresetId)}
          onChange={draft.setGridDefaults}
        />
      );
    case 'vision':
      return (
        <VisionTab
          gridDefaults={gridDefaults}
          vision={draft.defaultTokenVision}
          onChange={draft.setDefaultTokenVision}
          senses={rules.senses}
          onSensesChange={(next) => draft.setSenses(editedSenses(next, rules.systemSenses))}
        />
      );
    case 'widgets':
      return (
        <DefaultWidgetsTab
          defaultWidgets={draft.defaultWidgets}
          onChange={draft.setDefaultWidgets}
          initiative={rules.initiative}
          // Rules that are the game system's again store nothing, so the collection keeps following it
          onInitiativeChange={(next) => draft.setInitiative(isSameAsTyped(next, rules.systemInitiative) ? undefined : next)}
        />
      );
    case 'conditions':
      return <ConditionsTab conditions={conditions} onChange={draft.setConditions} />;
    case 'resources':
      return (
        <ResourcesTab
          resources={draft.resources}
          onChange={draft.setResources}
          fieldSuggestions={resourceFieldSuggestions(roleTemplates, creatures.creatures.map((creature) => creature.fields))}
        />
      );
    case 'statblocks':
      return app ? (
        <StatblocksTab
          app={app}
          collectionId={collectionId}
          ownRoles={draft.statblockRoles}
          onOwnRolesChange={draft.setStatblockRoles}
          folders={draft.statblockRoleFolders}
          onFoldersChange={draft.setStatblockRoleFolders}
          systemPresetId={draft.systemPresetId}
          presets={presets}
          canSave={canSave}
          onEditTemplate={onEditTemplate}
        />
      ) : null;
    case 'creatureFilters':
      return (
        <CreatureFiltersTab
          hidden={draft.hiddenCreatureFilters}
          onHiddenChange={draft.setHiddenCreatureFilters}
          custom={draft.customCreatureFilters}
          onCustomChange={draft.setCustomCreatureFilters}
          creatures={creatures.creatures}
          pending={creatures.pending}
          templates={roleTemplates}
        />
      );
    case 'loot':
      return app ? (
        <LootTab
          app={app}
          lootBases={draft.lootBases}
          onBasesChange={draft.setLootBases}
          currency={draft.lootCurrency}
          onCurrencyChange={draft.setLootCurrency}
        />
      ) : null;
  }
}
