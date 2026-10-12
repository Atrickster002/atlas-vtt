import React, { useId } from 'react';
import type { App } from 'obsidian';
import { ArrowLeft, Play, Square, Trash2 } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import { confirmAction } from '../../../ui/confirmDialog';
import { t } from '../../../i18n';
import { CampaignDescriptionField, CampaignNameField, NextSessionField } from './CampaignFields';
import { CampaignSystemSetting } from './CampaignSystemSetting';
import { campaignActivity, PlayingMark } from './CampaignRow';
import type { WorldMapChoice } from './libraryPictures';
import { PartyFaces } from './PartyFaces';
import type { PartyFace } from './useCampaignParties';
import { WorldMapPicker } from './WorldMapPicker';

interface CampaignPageProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  worldMaps: WorldMapChoice[];
  /** Whether this device plays the campaign. */
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  /** The player characters on its last scene. */
  party: readonly PartyFace[];
  onBack: () => void;
}

/** One campaign: its name, description, next session, world map and game system, edited where they stand; played from here. */
export function CampaignPage({ app, campaign, service, worldMaps, isPlaying, onPlay, onStop, party, onBack }: CampaignPageProps): React.JSX.Element {
  const locked = campaign.readOnly === true;
  const nextSessionId = useId();
  const worldMapId = useId();
  const systemId = useId();

  const deleteCampaign = async (): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('campaign.deleteTitle', { name: campaign.name }),
      message: [t('campaign.deleteMessage')],
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    service.delete(campaign.id);
    if (isPlaying) onStop();
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
        <div className="campaign-page__play">
          {isPlaying ? (
            <>
              <PlayingMark />
              <Button variant="ghost" className="campaign-page__stop" onClick={onStop}>
                <Square size={14} />
                <span>{t('campaign.stop')}</span>
              </Button>
            </>
          ) : (
            <Button className="campaign-page__start" disabled={locked} onClick={onPlay}>
              <Play size={14} />
              <span>{t('campaign.play')}</span>
            </Button>
          )}
          <PartyFaces faces={party} size="page" />
        </div>
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
            <div className="campaign-setting">
              <span id={systemId} className="campaign-setting__label">{t('campaign.gameSystem')}</span>
              <CampaignSystemSetting app={app} campaign={campaign} service={service} labelledBy={systemId} disabled={locked} />
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
