import type { App } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from '../campaigns/CampaignFiles';
import { CampaignPlay } from '../campaigns/campaignPlay';
import { onPlayedCampaignChange } from '../campaigns/playedCampaign';
import { CampaignService } from '../campaigns/CampaignService';
import type { WorldMapGate } from '../online/gm/book/worldMapGate.ts';
import { campaignWorldMap } from '../services/worldMap';

/**
 * The world map is the one of the campaign this device plays: none while it plays none. It may be
 * another whenever another campaign (or none) is played, a campaign changes, or the asset index or
 * a scene's artwork changes.
 */
export function campaignWorldMapGate(
  app: App,
  play: () => CampaignPlay = () => CampaignPlay.forApp(app),
  storage: () => CampaignStorage | undefined = () => CampaignFiles.forApp(app),
): WorldMapGate {
  return {
    worldMap: async () => {
      const campaigns = storage();
      return campaigns === undefined ? null : campaignWorldMap(app, new CampaignService(campaigns), play().playing());
    },
    onChange: (listener) => {
      // A map's or scene's artwork may be another once the asset index changed or a scene was saved.
      const refs = [app.workspace.on('atlas-vtt:refresh-assets', () => listener()), app.workspace.on('atlas-vtt:scene-thumbnail-updated', () => listener())];
      const stopCampaigns = onPlayedCampaignChange(app, listener, play, storage);
      return () => {
        stopCampaigns();
        for (const ref of refs) app.workspace.offref(ref);
      };
    },
  };
}
