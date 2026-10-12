import React, { useId, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import type { WorldMapChoice } from './libraryPictures';
import { NewCampaignField } from './NewCampaignField';
import { formatDay, formatRelativeTime, type RelativeTimePhrases } from './relativeTime';

const PLAYED: RelativeTimePhrases = {
  justNow: 'campaign.playedJustNow',
  minutes: 'campaign.playedMinutesAgo',
  hours: 'campaign.playedHoursAgo',
  days: 'campaign.playedDaysAgo',
};

const CREATED: RelativeTimePhrases = {
  justNow: 'campaign.createdJustNow',
  minutes: 'campaign.createdMinutesAgo',
  hours: 'campaign.createdHoursAgo',
  days: 'campaign.createdDaysAgo',
};

/** "Last played 3d ago", or when it was made for a campaign never played. */
export const campaignActivity = (campaign: Campaign): string => (campaign.lastPlayed !== undefined
  ? formatRelativeTime(campaign.lastPlayed, PLAYED)
  : formatRelativeTime(campaign.createdAt, CREATED));

interface CampaignsSectionProps {
  service: CampaignService;
  campaigns: Campaign[];
  worldMaps: WorldMapChoice[];
  onOpenCampaign: (id: string) => void;
}

/** The campaigns, the most recently played first, and the way to begin a new one. */
export function CampaignsSection({ service, campaigns, worldMaps, onOpenCampaign }: CampaignsSectionProps): React.JSX.Element {
  const [isCreating, setIsCreating] = useState(false);
  const headingId = useId();

  return (
    <section className="dashboard-panel campaigns-panel" aria-labelledby={headingId}>
      <div className="campaigns-panel__heading">
        <h2 id={headingId} className="panel-heading">{t('campaign.campaigns')}</h2>
        {!isCreating && (
          <Button variant="ghost" className="campaigns-new-btn" onClick={() => setIsCreating(true)}>
            <Plus size={16} />
            <span>{t('campaign.new')}</span>
          </Button>
        )}
      </div>
      {campaigns.length === 0 && !isCreating ? (
        <div className="campaigns-empty">{t('campaign.none')}</div>
      ) : (
        <div className="campaign-rows">
          {isCreating && (
            <NewCampaignField
              service={service}
              onCreated={(id) => { setIsCreating(false); onOpenCampaign(id); }}
              onCancel={() => setIsCreating(false)}
            />
          )}
          {campaigns.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              worldMap={worldMaps.find((choice) => choice.id === campaign.worldMap)}
              onOpen={() => onOpenCampaign(campaign.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface CampaignRowProps {
  campaign: Campaign;
  worldMap: WorldMapChoice | undefined;
  onOpen: () => void;
}

function CampaignRow({ campaign, worldMap, onOpen }: CampaignRowProps): React.JSX.Element {
  return (
    <Button variant="ghost" className="dashboard-row" onClick={onOpen}>
      <div className="dashboard-thumb">
        {worldMap?.thumbnailUrl ? <img src={worldMap.thumbnailUrl} alt="" /> : <BookOpen size={18} />}
      </div>
      <div className="dashboard-row__content">
        <div className="dashboard-row__name">{campaign.name}</div>
        <div className="dashboard-row__meta">
          <span>{campaignActivity(campaign)}</span>
          {campaign.nextSession && (
            <>
              <span className="dashboard-row__separator">&middot;</span>
              <span>{t('campaign.nextSessionOn', { date: formatDay(campaign.nextSession) })}</span>
            </>
          )}
        </div>
      </div>
    </Button>
  );
}
