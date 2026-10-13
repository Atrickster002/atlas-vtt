import { movedWithMap, sameStretch } from '../../../grid/mapStretch';
import { fittedLevelAlignment, type FoundGrid } from '../../../levels/levelAlignmentFit';
import { alignsSceneGrid, levelImagePlacement } from '../../../levels/levelAlignment';
import { viewedLevelId } from '../../../levels/sceneLevels';
import type { ViewAtlasStore } from '../../../storeFactory';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

/** The level whose image the alignment panel fits to the grid as it is; null where it aligns the scene's grid (the first level, as before levels). */
export function levelBeingFitted(store: ViewAtlasStore): string | null {
  const state = store.getState();
  const levelId = viewedLevelId(state);
  return alignsSceneGrid(state, levelId) ? null : levelId;
}

/**
 * Fits level `levelId`'s image to the scene's grid by the grid `found` on it (measured or detected
 * on the image drawn on its own): the grid stays, the level's alignment changes, and what stands on
 * that level alone follows its image, in one undo step. False, with a word to the GM, where the image
 * shows another kind of grid than the scene's.
 */
export function applyLevelAlignment(store: ViewAtlasStore, levelId: string, found: FoundGrid & { gridType?: string | undefined }, imageSize: { width: number; height: number } | null | undefined): boolean {
  const state = store.getState();
  const { grid } = state;
  if (!grid) return false;
  if (found.gridType && found.gridType !== (grid.type ?? 'square')) {
    showNotice(t('levels.alignOtherGrid'));
    return false;
  }
  const alignment = fittedLevelAlignment(grid, found, state.levelAlignments?.[levelId]);
  const from = levelImagePlacement(state, levelId);
  const to = levelImagePlacement({ ...state, levelAlignments: { ...state.levelAlignments, [levelId]: alignment } }, levelId);
  const move = imageSize && !sameStretch(from, to) ? movedWithMap(imageSize, from, to) : undefined;
  state.alignLevel(levelId, alignment, move);
  return true;
}
