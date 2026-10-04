/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings (`settingsTabs`):
 *   Game System | Dice | Grid & Measurement | Vision | Default Widgets | Conditions | Resources | Statblocks | Creature Filters | Loot
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Button } from '../../packages/components/primitives/button';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { deleteSystemPreset } from '../../services/systemPresetDeletion';
import { syncCollectionSystem } from '../../services/collectionSystemSync';
import { handledByAnotherControl } from '../../keyboard/tooltipEscape';
import { useSystemPresets } from '../hooks/useSystemPresets';
import { useCollectionSettingsDraft } from './collection-settings/useCollectionSettingsDraft';
import { useExperimentalFeature } from '../hooks/useExperimentalFeature';
import { collectionDiceRules, isValidDiceRules } from '../../gameSystems/diceRules';
import { collectionInitiativeRules, isValidInitiativeRules } from '../../gameSystems/initiativeRules';
import { sensesAreValid } from '../../gameSystems/senseEditing';
import { collectionSenses } from '../../gameSystems/senseRules';
import type { TemplateId } from '../../statblocks/model/templateTypes';
import { collectionStatblockRoles } from '../../statblocks/roles/collectionStatblockRoles';
import { statblockRolesAreValid } from '../../statblocks/roles/roleValidation';
import { useCollectionCreatures } from './collection-settings/useCollectionCreatures';
import { useRoleTemplates } from './collection-settings/useRoleTemplates';
import { isCompleteCreatureFilter } from '../../creatures/creatureFilterDefinitions';
import { areRangeBandsValid } from '../../grid/measurementFormat';

import { SettingsContent } from './collection-settings/SettingsContent';
import { SettingsTabContent } from './collection-settings/SettingsTabContent';
import { settingsTabs, type CollectionSettingsTab, type FeatureSwitches } from './collection-settings/settingsTabs';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';

export type { CollectionSettingsTab } from './collection-settings/settingsTabs';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  /** The tab it opens on; Game System by default. */
  initialTab?: CollectionSettingsTab;
  /**
   * Opens a statblock template for this collection (`collectionId`). The Statblocks tab's Edit
   * saves the settings and closes the dialog first; without it the tab offers no Edit.
   */
  onEditTemplate?: (templateId: TemplateId, collectionId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
  initialTab = 'system',
  onEditTemplate,
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const features: FeatureSwitches = {
    dynamicLighting: useExperimentalFeature('dynamicLighting'),
    statblockEditor: useExperimentalFeature('statblockEditor'),
  };
  const assetService = app ? AssetService.getInstance(app) : null;
  const systemPresets = useSystemPresets(app);
  const windowVariants = useDialogWindowVariants();

  const [activeTab, setActiveTab] = useState<CollectionSettingsTab>(initialTab);
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const draft = useCollectionSettingsDraft(assetService, collectionId, isOpen);
  const offersFields = isOpen && (activeTab === 'creatureFilters' || activeTab === 'resources');
  const collectionCreatures = useCollectionCreatures(app ?? null, assetService, collectionId, offersFields);
  const roleTemplates = useRoleTemplates(app ?? null, collectionStatblockRoles(draft, systemPresets.presets), offersFields);

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

  // Close on Escape key, unless an open list or another control in the dialog took it
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !handledByAnotherControl(e)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const dice = collectionDiceRules(draft, systemPresets.presets);
  const systemInitiative = collectionInitiativeRules({ systemPresetId: draft.systemPresetId }, systemPresets.presets);
  // The draft as it is typed, half a roll included; only stored rules are parsed
  const initiative = draft.initiative ?? systemInitiative;
  const senses = collectionSenses(draft, systemPresets.presets);
  // What the collection's game system gives it; an edit that ends up there again stores nothing.
  const systemSenses = collectionSenses({ systemPresetId: draft.systemPresetId }, systemPresets.presets);
  const canSave = areRangeBandsValid(draft.gridDefaults.abstractRangeBands)
    && isValidDiceRules(dice)
    && isValidInitiativeRules(initiative)
    && sensesAreValid(senses)
    && draft.customCreatureFilters.every(isCompleteCreatureFilter)
    && statblockRolesAreValid(draft.statblockRoles ?? [])
    // A resource without a name or a statblock field could never show
    && draft.resources.every((resource) => resource.name.trim() !== '' && resource.field.trim() !== '');

  /** Saves the draft and closes the dialog; false when nothing was saved. */
  const save = async (): Promise<boolean> => {
    if (!app || !assetService || !canSave) return false;

    try {
      await assetService.updateCollectionSettings(collectionId, draft.toSettings());
      // Widgets and token conditions follow the saved game system in every scene.
      await syncCollectionSystem(app, collectionId, systemPresets.presets);
      onClose();
      return true;
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
      return false;
    }
  };

  const editTemplate = onEditTemplate && ((templateId: TemplateId): void => {
    void save().then((saved) => { if (saved) onEditTemplate(templateId, collectionId); });
  });

  const handleDeletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!app || !systemPresets.service) return;
    if (draft.systemPresetId === preset.id) draft.clearSystem();
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  if (!isOpen) return null;

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="atlas-collection-settings-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="atlas-vtt-plugin atlas-collection-settings-modal"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-csm-title"
      >
        {/* Header */}
        <div className="atlas-collection-settings-header">
          <h3 id="atlas-csm-title">
            {collectionName} Settings
            {releaseLine && <span className="atlas-collection-settings-release">{releaseLine}</span>}
          </h3>
          <CloseButton onClick={onClose} aria-label="Close settings" />
        </div>

        {/* Body — sidebar + content */}
        <div className="atlas-collection-settings-body">
          {/* Vertical tab sidebar */}
          <nav className="atlas-collection-settings-sidebar">
            {settingsTabs(features).map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                className={`atlas-collection-settings-tab ${activeTab === tab.id ? 'atlas-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </nav>

          {/* Tab content */}
          <SettingsContent>
            <SettingsTabContent
              tab={activeTab}
              app={app}
              collectionId={collectionId}
              draft={draft}
              systemPresets={systemPresets}
              rules={{ dice, initiative, systemInitiative, senses, systemSenses }}
              features={features}
              creatures={collectionCreatures}
              roleTemplates={roleTemplates}
              canSave={canSave}
              onDeletePreset={handleDeletePreset}
              onEditTemplate={editTemplate}
            />
          </SettingsContent>
        </div>

        {/* Footer */}
        <div className="atlas-collection-settings-footer">
          <Button variant="outline" className="atlas-csm-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" className="atlas-csm-save" disabled={!canSave} onClick={() => { void save(); }}>
            Save
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
