import { t } from '../../../i18n';
import { levelObjects } from '../../../levels/levelObjects';
import { levelsChanged } from '../../../levels/levelsChanged';
import { hasLevels, levelById, viewedLevelId } from '../../../levels/sceneLevels';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import { isHistoryTravelling } from '../../../stores/history';
import { showNotice } from '../../../ui/notice';
import { levelLabel } from './levelEditing';

/** The selected ids that stand on the floor shown, or on none (what the selection's own code lets go of). */
function selectionOnShownLevel(state: ViewAtlasState): string[] {
  const shown = Object.values(levelObjects(state)).map((record) => record as Record<string, unknown>);
  const every = Object.values(state.objects).map((record) => record as Record<string, unknown> | undefined);
  return state.selectedIds.filter((id) => shown.some((record) => id in record) || !every.some((record) => record !== undefined && id in record));
}

/**
 * Undo and redo of a scene with floors show the floor they changed, as a design tool shows the page
 * of an undone edit: where a step changed nothing on the floor shown, the view goes to the floor it
 * changed and the GM is told, so no undo works out of sight. A step that changed the floor shown
 * stays there, and what it took to another floor leaves the selection. Returns the unsubscribe.
 */
export function followHistoryAcrossLevels(store: ViewAtlasStore): () => void {
  return store.subscribe((state, previous) => {
    if (state.objects === previous.objects && state.levelAlignments === previous.levelAlignments) return;
    const { levels } = state;
    if (!hasLevels(levels) || !state.mapLoaded || state.isMapLoading || !isHistoryTravelling(store)) return;
    const changed = levelsChanged(previous, state, levels);
    const shown = viewedLevelId(state);
    if (shown === null || changed.length === 0) return;
    if (changed.includes(shown)) {
      const kept = selectionOnShownLevel(state);
      if (kept.length !== state.selectedIds.length) state.setSelection(kept);
      return;
    }
    const target = levelById(levels, changed[0] ?? null);
    if (!target) return;
    state.setViewedLevel(target.id);
    showNotice(t('levels.historyShown', { name: levelLabel(levels, target) }));
  });
}
