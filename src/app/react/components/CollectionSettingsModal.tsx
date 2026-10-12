/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings:
 *   Game System | Dice | Grid & Measurement | Vision | Default Widgets | Conditions | Resources | Creature Filters | Loot
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { deleteSystemPreset } from '../../services/systemPresetDeletion';
import { syncCollectionSystem } from '../../services/collectionSystemSync';
import { useSystemPresets } from '../hooks/useSystemPresets';
import { useCollectionSettingsDraft } from './collection-settings/useCollectionSettingsDraft';
import { useExperimentalFeature } from '../hooks/useExperimentalFeature';
import { DefaultWidgetsTab } from './collection-settings/DefaultWidgetsTab';
import { discoverResourceFields } from '../../resources/resourceFields';
import { LootTab } from './collection-settings/LootTab';
import { viewOfRules } from '../../gameSystems/rulesView';
import { CreatureFiltersTab } from './collection-settings/CreatureFiltersTab';
import { useCollectionCreatures } from './collection-settings/useCollectionCreatures';
import { isCompleteCreatureFilter } from '../../creatures/creatureFilterDefinitions';
import { initiativeEdit, RulesSettingsTabs, type SettingsTab } from './collection-settings/RulesSettingsTabs';
import { SettingsDialog } from './collection-settings/SettingsDialog';
import { t } from '../../i18n';

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  /** The tab it opens on; Game System by default. */
  initialTab?: CollectionSettingsTab;
}

export type CollectionSettingsTab = Exclude<SettingsTab, 'initiative'>;

const TABS: readonly CollectionSettingsTab[] = ['system', 'dice', 'grid', 'vision', 'widgets', 'conditions', 'resources', 'creatureFilters', 'loot'];

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
  initialTab = 'system',
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const lightingOn = useExperimentalFeature('dynamicLighting');
  const assetService = app ? AssetService.getInstance(app) : null;
  const systemPresets = useSystemPresets(app);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const draft = useCollectionSettingsDraft(assetService, collectionId, isOpen);
  const collectionIds = useMemo(() => [collectionId], [collectionId]);
  const collectionCreatures = useCollectionCreatures(app ?? null, assetService, collectionIds, isOpen && (activeTab === 'creatureFilters' || activeTab === 'resources'));

  // Resolve the collection name for the header
  useEffect(() => {
    if (!isOpen || !assetService) return;
    let cancelled = false;

    assetService.getCollections().then((cols) => {
      if (cancelled) return;
      const match = cols.find((c) => c.id === collectionId);
      setCollectionName(match?.name ?? collectionId);
      setReleaseLine(match ? `v${match.version}${match.author ? ` · by ${match.author}` : ''}` : '');
    }).catch((err) => {
      console.error('[CollectionSettingsModal] Failed to load collections:', err);
    });

    return () => { cancelled = true; };
  }, [isOpen, collectionId, assetService]);

  const view = viewOfRules(draft, systemPresets.presets);
  const canSave = view.isValid && draft.customCreatureFilters.every(isCompleteCreatureFilter);

  const handleSave = async (): Promise<void> => {
    if (!app || !assetService || !canSave) return;

    try {
      await assetService.updateCollectionSettings(collectionId, draft.toSettings());
      // Widgets and token conditions follow the saved game system in every scene.
      await syncCollectionSystem(app, collectionId, systemPresets.presets);
      onClose();
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
    }
  };

  const handleDeletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!app || !systemPresets.service) return;
    if (draft.systemPresetId === preset.id) draft.clearSystem();
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  const renderOther = (tab: SettingsTab): React.ReactNode => {
    switch (tab) {
      case 'widgets':
        return (
          <DefaultWidgetsTab
            defaultWidgets={draft.defaultWidgets}
            onChange={draft.setDefaultWidgets}
            initiative={view.initiative}
            onInitiativeChange={initiativeEdit(draft, view)}
          />
        );
      case 'creatureFilters':
        return (
          <CreatureFiltersTab
            hidden={draft.hiddenCreatureFilters}
            onHiddenChange={draft.setHiddenCreatureFilters}
            custom={draft.customCreatureFilters}
            onCustomChange={draft.setCustomCreatureFilters}
            creatures={collectionCreatures.creatures}
            pending={collectionCreatures.pending}
          />
        );
      case 'loot':
        return app && (
          <LootTab
            app={app}
            lootBases={draft.lootBases}
            onBasesChange={draft.setLootBases}
            currency={draft.lootCurrency}
            onCurrencyChange={draft.setLootCurrency}
          />
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <SettingsDialog
      title={t('csm.title', { name: collectionName })}
      subtitle={releaseLine}
      closeLabel={t('csm.close')}
      canSave={canSave}
      onSave={() => { void handleSave(); }}
      onClose={onClose}
    >
      <RulesSettingsTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        draft={draft}
        view={view}
        presets={systemPresets}
        onDeletePreset={handleDeletePreset}
        lightingOn={lightingOn}
        fieldSuggestions={discoverResourceFields(collectionCreatures.creatures.map((creature) => creature.fields))}
        renderOther={renderOther}
      />
    </SettingsDialog>
  );
}
