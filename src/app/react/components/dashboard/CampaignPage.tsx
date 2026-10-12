import React, { useId } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import { confirmAction } from '../../../ui/confirmDialog';
import { t } from '../../../i18n';
import { CampaignDescriptionField, CampaignNameField, NextSessionField } from './CampaignFields';
import { campaignActivity } from './CampaignsSection';
import type { WorldMapChoice } from './libraryPictures';
import { WorldMapPicker } from './WorldMapPicker';

interface CampaignPageProps {
  campaign: Campaign;
  service: CampaignService;
  worldMaps: WorldMapChoice[];
  onBack: () => void;
}

/** One campaign: its name, description, next session and world map, edited where they stand. */
export function CampaignPage({ campaign, service, worldMaps, onBack }: CampaignPageProps): React.JSX.Element {
  const locked = campaign.readOnly === true;
  const nextSessionId = useId();
  const worldMapId = useId();

  const deleteCampaign = async (): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('campaign.deleteTitle', { name: campaign.name }),
      message: [t('campaign.deleteMessage')],
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (confirmed) service.delete(campaign.id);
  };

  return (
    <div className="campaign-page">
      <Button variant="ghost" className="campaign-page__back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>{t('campaign.backToDashboard')}</span>
      </Button>

      <header className="campaign-page__header">
        <CampaignNameField campaign={campaign} service={service} disabled={locked} />
        <span className="campaign-page__meta">{campaignActivity(campaign)}</span>
        {locked && <p className="campaign-page__locked">{t('campaign.newerVersion')}</p>}
      </header>

      <div className="campaign-page__columns">
        <div className="campaign-page__main">
          <CampaignDescriptionField campaign={campaign} service={service} disabled={locked} />
        </div>

        <aside className="campaign-page__side">
          <div className="dashboard-panel campaign-settings">
            <div className="campaign-setting">
              <span id={nextSessionId} className="campaign-setting__label">{t('campaign.nextSession')}</span>
              <NextSessionField campaign={campaign} service={service} disabled={locked} labelledBy={nextSessionId} />
            </div>
            <div className="campaign-setting">
              <span id={worldMapId} className="campaign-setting__label">{t('campaign.worldMap')}</span>
              <WorldMapPicker
                choices={worldMaps}
                value={campaign.worldMap}
                onChange={(id) => service.update(campaign.id, { worldMap: id ?? '' })}
                labelledBy={worldMapId}
                disabled={locked}
              />
            </div>
          </div>
          <Button variant="ghost" className="campaign-page__delete" disabled={locked} onClick={() => { void deleteCampaign(); }}>
            <Trash2 size={16} />
            <span>{t('campaign.delete')}</span>
          </Button>
        </aside>
      </div>
    </div>
  );
}
