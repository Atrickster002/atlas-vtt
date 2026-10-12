import React from 'react';
import { FileText, Loader2, Map } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import { formatRelativeTime } from './relativeTime';
import { lastActivity, type RecentScene } from './useRecentScenes';

interface RecentScenesPanelProps {
  scenes: RecentScene[];
  isLoading: boolean;
  onOpenScene: (path: string) => void;
}

export function RecentScenesPanel({ scenes, isLoading, onOpenScene }: RecentScenesPanelProps): React.JSX.Element {
  return (
    <div className="dashboard-panel">
      <div className="panel-heading">{t('dashboard.recent')}</div>
      {isLoading ? (
        <div className="recent-loading">
          <Loader2 size={20} className="spinner" />
          <span>{t('dashboard.loadingScenes')}</span>
        </div>
      ) : scenes.length > 0 ? (
        <div className="recent-scenes">
          {scenes.map((scene) => (
            <Button key={scene.id} variant="ghost" className="dashboard-row" onClick={() => onOpenScene(scene.path)}>
              <div className="dashboard-thumb">
                {scene.thumbnailUrl ? <img src={scene.thumbnailUrl} alt={scene.name} /> : <Map size={18} />}
              </div>
              <div className="dashboard-row__content">
                <div className="dashboard-row__name">{scene.name}</div>
                <div className="dashboard-row__meta">
                  <span className="dashboard-row__collection">{scene.collectionName}</span>
                  <span className="dashboard-row__separator">&middot;</span>
                  <span>{formatRelativeTime(lastActivity(scene))}</span>
                </div>
              </div>
            </Button>
          ))}
        </div>
      ) : (
        <div className="recent-empty">
          <FileText size={28} className="empty-icon" />
          <p>{t('dashboard.noScenes')}</p>
        </div>
      )}
    </div>
  );
}
