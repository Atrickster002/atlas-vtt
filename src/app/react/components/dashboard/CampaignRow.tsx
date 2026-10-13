import React from 'react';
import { BookOpen } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import type { WorldMapChoice } from './libraryPictures';
import { PartyFaces } from './PartyFaces';
import { formatDay, formatRelativeTime, type RelativeTimePhrases } from './relativeTime';
import type { PartyFace } from './useCampaignParties';

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

/** Says that this device plays the campaign. */
export function PlayingMark(): React.JSX.Element {
  return <span className="campaign-playing">{t('campaign.playing')}</span>;
}

interface CampaignRowProps {
  campaign: Campaign;
  worldMap: WorldMapChoice | undefined;
  isPlaying: boolean;
  party: readonly PartyFace[];
  onOpen: () => void;
}

/** A campaign on the dashboard: its world map, name, when it was played, and the party on its last scene. */
export function CampaignRow({ campaign, worldMap, isPlaying, party, onOpen }: CampaignRowProps): React.JSX.Element {
  return (
    <Button variant="ghost" className="dashboard-row campaign-row" onClick={onOpen}>
      <div className="dashboard-thumb">
        {worldMap?.thumbnailUrl ? <img src={worldMap.thumbnailUrl} alt="" /> : <BookOpen size={18} />}
      </div>
      <div className="dashboard-row__content">
        <div className="dashboard-row__name">{campaign.name}</div>
        <div className="dashboard-row__meta">
          {isPlaying && (
            <>
              <PlayingMark />
              <span className="dashboard-row__separator">&middot;</span>
            </>
          )}
          <span>{campaignActivity(campaign)}</span>
          {campaign.nextSession && (
            <>
              <span className="dashboard-row__separator">&middot;</span>
              <span>{t('campaign.nextSessionOn', { date: formatDay(campaign.nextSession) })}</span>
            </>
          )}
        </div>
      </div>
      <PartyFaces faces={party} size="row" />
    </Button>
  );
}
