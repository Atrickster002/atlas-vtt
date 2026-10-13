import React from 'react';
import { Plus } from 'lucide-react';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { collectionIdOfPath } from '../../../services/assetPaths';
import { runInBackground } from '../../../utils/backgroundTask';
import { addLevel, changeLevel, changeLevelBackground, deleteLevel, levelLabel, moveLevel } from '../levels/levelEditing';
import { pickMapImage } from '../levels/MapImagePickerModal';
import { SceneLevelRow } from './SceneLevelRow';
import { t } from '../../../i18n';

/**
 * The command palette page for the open scene's levels, top floor first: add one on a map
 * image, rename it, set its elevation, move it, change its image or delete it.
 */
export function SceneLevelsPanel(): React.ReactElement {
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const levels = useAtlasStore((state) => state.levels);
  const viewed = useAtlasStore((state) => viewedLevelId(state));
  const mapPath = useAtlasStore((state) => state.mapPath);
  const collection = collectionIdOfPath(mapPath);
  const pick = (onChoose: (path: string | null) => void): void => runInBackground(pickMapImage(app, collection, onChoose), 'Picking a map image');
  const several = levels && levels.length > 1 ? levels : null;

  return (
    <div className="atlas-scene-levels">
      <button type="button" className="atlas-scene-levels__add" onClick={() => pick((path) => addLevel(store, path))}>
        <Plus />
        <span>{t('levels.add')}</span>
      </button>
      {several ? (
        <div className="atlas-scene-levels__list">
          {[...several].reverse().map((level) => {
            const index = several.indexOf(level);
            return (
              <SceneLevelRow
                key={level.id}
                level={level}
                name={levelLabel(several, level)}
                isViewed={level.id === viewed}
                canMoveUp={index < several.length - 1}
                canMoveDown={index > 0}
                onShow={() => store.getState().setViewedLevel(level.id)}
                onRename={(name) => changeLevel(store, level.id, { name })}
                onElevation={(elevation) => changeLevel(store, level.id, { elevation })}
                onMove={(direction) => moveLevel(store, level.id, direction)}
                onPickImage={() => pick((path) => changeLevelBackground(store, level.id, path))}
                onDelete={() => runInBackground(deleteLevel(store, level.id), 'Deleting a level')}
              />
            );
          })}
        </div>
      ) : (
        <p className="atlas-scene-levels__hint">{t('levels.empty')}</p>
      )}
    </div>
  );
}
