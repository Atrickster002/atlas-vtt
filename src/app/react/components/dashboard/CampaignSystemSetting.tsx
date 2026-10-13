import React, { useState } from 'react';
import type { App } from 'obsidian';
import { AnimatePresence } from 'framer-motion';
import { Settings2 } from 'lucide-react';
import { campaignRules, type CampaignSystem } from '../../../campaigns/campaignSystem';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { viewOfRules } from '../../../gameSystems/rulesView';
import { findActivePreset, sameSystemRules } from '../../../gameSystems/systemRules';
import type { DiceSet } from '../../../types/diceSetTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { t } from '../../../i18n';
import { useSystemPresets } from '../../hooks/useSystemPresets';
import { useDiceSets } from '../../hooks/useDiceSets';
import { CampaignRulesDialog } from './CampaignRulesDialog';

interface CampaignSystemSettingProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  labelledBy: string;
  disabled: boolean;
}

/** What the row says of a system: its preset's name, or Custom, and whether it was edited since. */
function systemName(
  system: CampaignSystem, presets: readonly SystemPreset[], sets: readonly DiceSet[],
): { name: string; edited: boolean } {
  const { systemRules } = viewOfRules(campaignRules(system, presets), presets, sets);
  const active = findActivePreset(presets, system.systemPresetId, systemRules);
  return active
    ? { name: active.name, edited: !sameSystemRules(active.rules, systemRules) }
    : { name: t('csm.system.custom'), edited: false };
}

/** The campaign's game system on its page: its name, and the button that opens its settings. */
export function CampaignSystemSetting({ app, campaign, service, labelledBy, disabled }: CampaignSystemSettingProps): React.JSX.Element {
  const { presets } = useSystemPresets(app);
  const { sets } = useDiceSets(app);
  const [isOpen, setIsOpen] = useState(false);
  const shown = campaign.system ? systemName(campaign.system, presets, sets) : null;

  return (
    <div className="campaign-system">
      <button
        type="button"
        className="campaign-system__trigger"
        aria-labelledby={labelledBy}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        <span className={shown ? 'campaign-system__name' : 'campaign-system__name is-empty'}>{shown?.name ?? t('csm.system.none')}</span>
        {shown?.edited && <span className="atlas-csm-tag atlas-csm-tag--accent">{t('csm.system.edited')}</span>}
        <Settings2 aria-hidden="true" className="campaign-system__icon" />
      </button>
      {/* Room for a clear button, so the control ends where the others do. */}
      <span className="campaign-clear-slot" />
      <AnimatePresence>
        {isOpen && <CampaignRulesDialog app={app} campaign={campaign} service={service} onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
