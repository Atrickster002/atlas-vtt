import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { Campaign } from '../../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../../campaigns/CampaignService';
import { campaignWorldMap } from '../../../../services/worldMap';
import { resourceUrl } from '../libraryPictures';

/** The campaign's world map as an image URL, the artwork players are shown; null while it has none. */
export function useWorldMapImage(app: App, service: CampaignService, campaign: Pick<Campaign, 'id' | 'worldMap'>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const { id, worldMap } = campaign;

  useEffect(() => {
    let current = true;
    if (worldMap === undefined) {
      setUrl(null);
      return undefined;
    }
    campaignWorldMap(app, service, id)
      .then((path) => { if (current) setUrl(resourceUrl(app, path ?? undefined)); })
      .catch((error: unknown) => {
        console.error('[Dashboard] Reading the world map failed:', error);
        if (current) setUrl(null);
      });
    return () => { current = false; };
  }, [app, service, id, worldMap]);

  return url;
}
