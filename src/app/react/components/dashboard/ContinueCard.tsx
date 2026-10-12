import React from 'react';
import { Clock, Map, Play, Plus, Sparkles } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';
import { formatRelativeTime } from './relativeTime';
import { lastActivity, type RecentScene } from './useRecentScenes';

interface ContinueCardProps {
  scene: RecentScene | null;
  onOpenScene: (path: string) => void;
  onCreateMap: () => void;
}

/** The scene played last, one press away; without scenes, the way to make the first. */
export function ContinueCard({ scene, onOpenScene, onCreateMap }: ContinueCardProps): React.JSX.Element {
  if (!scene) {
    return (
      <Button variant="ghost" className="hero-card hero-card--empty" onClick={onCreateMap}>
        <div className="hero-card-body">
          <span className="hero-card-eyebrow">
            <Sparkles size={13} /> {t('dashboard.begin')}
          </span>
          <span className="hero-card-title">{t('dashboard.firstScene')}</span>
          <span className="hero-card-meta">{t('dashboard.firstSceneMeta')}</span>
        </div>
        <span className="hero-card-go">
          <Plus size={18} />
        </span>
      </Button>
    );
  }

  return (
    <Button variant="ghost" className="hero-card" onClick={() => onOpenScene(scene.path)}>
      <div className="dashboard-thumb dashboard-thumb--l">
        {scene.thumbnailUrl ? <img src={scene.thumbnailUrl} alt="" /> : <Map size={24} />}
      </div>
      <div className="hero-card-body">
        <span className="hero-card-eyebrow">
          <Clock size={13} /> {t('dashboard.continue')}
        </span>
        <span className="hero-card-title">{scene.name}</span>
        <span className="hero-card-meta">
          {scene.collectionName} &middot; {formatRelativeTime(lastActivity(scene))}
        </span>
      </div>
      <span className="hero-card-go">
        <Play size={18} />
      </span>
    </Button>
  );
}
