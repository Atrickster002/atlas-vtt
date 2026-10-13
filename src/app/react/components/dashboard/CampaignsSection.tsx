import React, { useId, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { Plus } from 'lucide-react';
import { campaignsMatching } from '../../../campaigns/campaignSearch';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { HeaderSearch } from '../../../packages/components/asset-manager/components/HeaderSearch';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import { CampaignRow } from './CampaignRow';
import type { WorldMapChoice } from './libraryPictures';
import { NewCampaignField } from './NewCampaignField';
import type { CampaignParties } from './useCampaignParties';

interface CampaignsSectionProps {
  app: App;
  service: CampaignService;
  campaigns: Campaign[];
  worldMaps: WorldMapChoice[];
  /** The campaign this device plays, or null. */
  playingId: string | null;
  parties: CampaignParties;
  onOpenCampaign: (id: string) => void;
}

/** The campaigns, the most recently played first, searched by name and description, and the way to begin a new one. */
export function CampaignsSection({ app, service, campaigns, worldMaps, playingId, parties, onOpenCampaign }: CampaignsSectionProps): React.JSX.Element {
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const headingId = useId();
  const found = useMemo(() => campaignsMatching(campaigns, search), [campaigns, search]);

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
      {campaigns.length > 0 && (
        <div className="campaigns-search">
          <HeaderSearch app={app} search={search} onSearch={setSearch} label={t('campaign.search')} shortcut={false} />
        </div>
      )}
      {campaigns.length === 0 && !isCreating ? (
        <div className="campaigns-empty">{t('campaign.none')}</div>
      ) : (
        <div className="campaign-rows">
          {isCreating && (
            <NewCampaignField
              service={service}
              onCreated={(id) => { setIsCreating(false); setSearch(''); onOpenCampaign(id); }}
              onCancel={() => setIsCreating(false)}
            />
          )}
          {found.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              worldMap={worldMaps.find((choice) => choice.id === campaign.worldMap)}
              isPlaying={campaign.id === playingId}
              party={parties.get(campaign.id) ?? []}
              onOpen={() => onOpenCampaign(campaign.id)}
            />
          ))}
          {found.length === 0 && <div className="campaigns-empty">{t('campaign.noMatches')}</div>}
        </div>
      )}
    </section>
  );
}
