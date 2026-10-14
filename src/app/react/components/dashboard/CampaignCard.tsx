import React from 'react';
import type { App } from 'obsidian';
import { Compass } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { fnv1a32 } from '../../../utils/hashing';
import { t } from '../../../i18n';
import type { WorldMapChoice } from './libraryPictures';
import { MapArt } from './MapArt';
import { PartyFaces } from './PartyFaces';
import { useWorldMapArtwork } from './useWorldMapArtwork';
import { formatRelativeTime, type RelativeTimePhrases } from './relativeTime';
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

/** A hue of the campaign's own, for the art of a campaign without a world map: each looks a little different. */
export function campaignHueStyle(campaign: Campaign): React.CSSProperties {
  return { '--campaign-hue': `${fnv1a32(campaign.id) % 360}` } as React.CSSProperties;
}

/** The art of a campaign without a world map: its own tint and a compass. */
export function CampaignEmblem(): React.JSX.Element {
  return (
    <span className="campaign-emblem" aria-hidden="true">
      <Compass className="campaign-emblem__icon" strokeWidth={1.25} />
    </span>
  );
}

interface CampaignCardProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  worldMap: WorldMapChoice | undefined;
  /** The name of its game system, or null for none. */
  systemName: string | null;
  isPlaying: boolean;
  party: readonly PartyFace[];
  onOpen: () => void;
}

/** A campaign on the dashboard: its world map with the party of its last scene on it, its name, game system and when it was played. */
export function CampaignCard({ app, campaign, service, worldMap, systemName, isPlaying, party, onOpen }: CampaignCardProps): React.JSX.Element {
  const artwork = useWorldMapArtwork(app, service, campaign);
  const hasWorldMap = campaign.worldMap !== undefined;

  return (
    <button type="button" className="dashboard-card campaign-card" style={campaignHueStyle(campaign)} onClick={onOpen}>
      <span className="dashboard-card__art campaign-card__art">
        {hasWorldMap
          ? <MapArt app={app} path={artwork.path} pathPending={artwork.pending} thumbnailUrl={worldMap?.thumbnailUrl ?? null} empty={<CampaignEmblem />} />
          : <CampaignEmblem />}
        {isPlaying && <span className="campaign-card__badge"><PlayingMark /></span>}
        {party.length > 0 && <span className="campaign-card__party"><PartyFaces faces={party} size="row" /></span>}
      </span>
      <span className="dashboard-card__body campaign-card__body">
        <span className="dashboard-card__text">
          <span className="dashboard-card__title">{campaign.name}</span>
          <span className="dashboard-card__meta">
            {systemName !== null && (
              <>
                <span className="dashboard-card__system">{systemName}</span>
                <span className="dashboard-card__separator" aria-hidden="true">&middot;</span>
              </>
            )}
            <span>{campaignActivity(campaign)}</span>
          </span>
        </span>
      </span>
    </button>
  );
}
