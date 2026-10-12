import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { FolderOpen, Plus } from 'lucide-react';
import type { CampaignStorage } from '../../../campaigns/CampaignFiles';
import { useCampaigns } from '../../../campaigns/useCampaigns';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import { CampaignPage } from './CampaignPage';
import { CampaignsSection } from './CampaignsSection';
import { ContinueCard } from './ContinueCard';
import { useWorldMaps } from './libraryPictures';
import { RecentScenesPanel } from './RecentScenesPanel';
import { useRecentScenes } from './useRecentScenes';

export interface DashboardProps {
  app: App;
  /** The vault's campaigns; undefined until the plugin opened them. */
  campaignStorage: CampaignStorage | undefined;
  onOpenScene: (filePath: string) => void;
  onCreateMap: () => void;
  onOpenAssetManager: () => void;
}

/** Atlas' start page: the scene to continue, the campaigns, recent scenes; or one campaign's page. */
export function Dashboard({ app, campaignStorage, onOpenScene, onCreateMap, onOpenAssetManager }: DashboardProps): React.JSX.Element {
  const { scenes, isLoading } = useRecentScenes(app);
  const { service, campaigns } = useCampaigns(campaignStorage);
  const worldMaps = useWorldMaps(app);
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openCampaign = openId === null ? undefined : campaigns.find((campaign) => campaign.id === openId);

  // A campaign deleted elsewhere takes its page with it.
  useEffect(() => {
    if (openId !== null && openCampaign === undefined) setOpenId(null);
  }, [openId, openCampaign]);

  // A page opens at its top, wherever the one before was scrolled to.
  useLayoutEffect(() => {
    for (let node: HTMLElement | null = rootRef.current; node; node = node.parentElement) {
      if (node.scrollTop > 0) {
        node.scrollTop = 0;
        return;
      }
    }
  }, [openId]);

  const actionTiles = [
    { key: 'create', icon: Plus, title: t('dashboard.createScene'), desc: t('dashboard.createSceneDesc'), onClick: onCreateMap },
    { key: 'assets', icon: FolderOpen, title: t('dashboard.assets'), desc: t('dashboard.assetsDesc'), onClick: onOpenAssetManager },
  ] as const;

  return (
    <div ref={rootRef} className="atlas-dashboard">
      <div className="dashboard-container">
        {service && openCampaign ? (
          <CampaignPage campaign={openCampaign} service={service} worldMaps={worldMaps} onBack={() => setOpenId(null)} />
        ) : (
          <main className="dashboard-stage">
            <div className="dashboard-hero">
              <h1 className="dashboard-title">
                Atlas<span>VTT</span>
              </h1>
              <p className="dashboard-tagline">{t('dashboard.tagline')}</p>
            </div>

            <div className="dashboard-columns">
              <div className="dashboard-actions">
                <ContinueCard scene={scenes[0] ?? null} onOpenScene={onOpenScene} onCreateMap={onCreateMap} />
                {service && (
                  <CampaignsSection service={service} campaigns={campaigns} worldMaps={worldMaps} onOpenCampaign={setOpenId} />
                )}
                <div className="action-grid">
                  {actionTiles.map(({ key, icon: Icon, title, desc, onClick }) => (
                    <Button key={key} variant="ghost" className="action-card" onClick={onClick}>
                      <span className="action-icon">
                        <Icon size={18} />
                      </span>
                      <span className="action-text">
                        <span className="action-title">{title}</span>
                        <span className="action-desc">{desc}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <aside className="dashboard-recent">
                <RecentScenesPanel scenes={scenes} isLoading={isLoading} onOpenScene={onOpenScene} />
              </aside>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
