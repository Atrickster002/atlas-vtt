import type { AtlasView } from '../atlas-view';
import { MapController } from '../MapController';
import { hasLevels, resolveLevel, viewedLevelId } from '../levels/sceneLevels';
import { presentedSceneOf } from './presentedScene';

/**
 * Whether `view` shows players' level of the presented scene, its map image loaded, while its tab
 * is the presented one; true for any other tab, which players never see live.
 */
export function showsPresentedLevel(view: AtlasView): boolean {
  const state = view.atlasStore.getState();
  if (!hasLevels(state.levels)) return true;
  const presented = presentedSceneOf(view.app).get();
  if (!presented || view.tabMetaStore.getState().activeTabId !== presented.tabId) return true;
  return viewedLevelId(state) === resolveLevel(state.levels, presented.levelId)
    && MapController.showsViewedLevel(view.serviceManager.getRendererService().getRenderer()?.getMapImage() ?? null, state);
}
