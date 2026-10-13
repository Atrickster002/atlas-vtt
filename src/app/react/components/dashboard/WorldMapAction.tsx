import React, { useState } from 'react';
import { TFile, type App } from 'obsidian';
import { FilePlus2, MapIcon } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { openMapInView } from '../../../plugin/atlasLeaves';
import { AssetService } from '../../../services/AssetService';
import { createScene, freeSceneName } from '../../../services/createScene';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';
import type { WorldMapChoice } from './libraryPictures';

interface WorldMapActionProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  /** The campaign's world map, as the picker offers it. */
  choice: WorldMapChoice | undefined;
  disabled: boolean;
}

/** Opens the scene a campaign's world map is, where the GM sets its pins. */
async function openScene(app: App, scenePath: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(scenePath);
  if (file instanceof TFile) await openMapInView(app, file);
}

/**
 * Makes a scene on the image of a world map that is a plain map, in the map's collection and named
 * after it, makes that scene the campaign's world map and opens it: only a scene holds pins.
 */
async function makeScene(app: App, campaign: Campaign, service: CampaignService, mapId: string): Promise<void> {
  const assets = AssetService.getInstance(app);
  const map = await assets.getAssetById(mapId);
  if (map?.type !== 'map') return;
  const { file, asset } = await createScene(app, assets, { name: freeSceneName(app, map.collection, map.name), collectionId: map.collection, background: map.mapFilePath });
  service.update(campaign.id, { worldMap: asset.id });
  await openMapInView(app, file);
}

/**
 * The campaign's world map, beside Play: a scene opens, so the GM can set the pins that lead
 * players into other scenes; a plain map has no pins and is made a scene first.
 */
export function WorldMapAction({ app, campaign, service, choice, disabled }: WorldMapActionProps): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  if (choice === undefined) return null;
  const { scenePath } = choice;

  if (choice.kind === 'scene') {
    return (
      <Button variant="ghost" disabled={scenePath === undefined} onClick={() => { if (scenePath !== undefined) void openScene(app, scenePath); }}>
        <MapIcon size={14} />
        <span>{t('campaign.openWorldMap')}</span>
      </Button>
    );
  }

  const make = (): void => {
    setBusy(true);
    makeScene(app, campaign, service, choice.id)
      .catch((error: unknown) => showNotice(t('campaign.makeWorldMapSceneFailed', { error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setBusy(false));
  };
  return (
    <LabelTooltip label={t('campaign.makeWorldMapSceneHint')} describe>
      <Button variant="ghost" disabled={disabled || busy} onClick={make}>
        <FilePlus2 size={14} />
        <span>{t('campaign.makeWorldMapScene')}</span>
      </Button>
    </LabelTooltip>
  );
}
