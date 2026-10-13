import { t } from '../../../i18n';
import { withLevelAdded, withLevelChanged, withLevelDeleted, withLevelsReordered, type LevelScene } from '../../../levels/levelEdits';
import { firstLevelId } from '../../../levels/sceneLevels';
import type { ViewAtlasStore } from '../../../storeFactory';
import { getHistoryStore, runUntracked } from '../../../stores/history';
import type { LevelElevation, SceneLevel } from '../../../types/sceneLevelTypes';
import { chooseAction } from '../../../ui/confirmDialog';

/**
 * Edits of a scene's levels from its settings. Levels are scene settings, like its lighting:
 * no edit of them is an undo step. An edit that also moves objects or the first level's map
 * (reordering past the first level, deleting a level) clears the history, whose steps name the
 * levels as they were.
 */

/** What a level is called: its name, or its place among the scene's levels while it has none. */
export function levelLabel(levels: readonly SceneLevel[], level: SceneLevel): string {
  return level.name.trim() || t('levels.newName', { n: levels.indexOf(level) + 1 });
}

/** Adds a level on top with `background` and shows it; a scene without levels gets its first one too. */
export function addLevel(store: ViewAtlasStore, background: string | null): void {
  const state = store.getState();
  const count = (state.levels?.length || 1) + 1;
  const levels = withLevelAdded(state, { name: t('levels.newName', { n: count }), background }, t('levels.firstName'));
  runUntracked(store, () => state.setLevels(levels));
  store.getState().setViewedLevel(levels.at(-1)?.id ?? null);
}

/** Renames level `id`, or changes its elevation. */
export function changeLevel(store: ViewAtlasStore, id: string, changes: { name?: string; elevation?: LevelElevation }): void {
  const { levels, setLevels } = store.getState();
  if (!levels) return;
  runUntracked(store, () => setLevels(withLevelChanged(levels, id, changes)));
}

/** Shows `background` on level `id`; the first level's is the scene's own background, an edit like any other of it. */
export function changeLevelBackground(store: ViewAtlasStore, id: string, background: string | null): void {
  const state = store.getState();
  if (!state.levels) return;
  if (id === firstLevelId(state.levels)) state.setBackground(background);
  else runUntracked(store, () => state.setLevels(withLevelChanged(state.levels!, id, { background })));
}

/** Writes an edit that moved objects or the first level's map, and lets go of the history that knew them otherwise. */
function applyScene(store: ViewAtlasStore, before: LevelScene, after: LevelScene): void {
  if (after === before) return;
  runUntracked(store, () => store.getState().applyLevelScene(after));
  if (after.objects !== before.objects || after.background !== before.background) getHistoryStore(store)?.getState().clear();
}

/** Moves level `id` one place up (towards the top floor) or down. */
export function moveLevel(store: ViewAtlasStore, id: string, direction: 1 | -1): void {
  const state = store.getState();
  const ids = (state.levels ?? []).map((level) => level.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];
  applyScene(store, state, withLevelsReordered(state, ids));
}

/** Asks whether the objects of level `id` move to the level next to it or go with it, then deletes the level. */
export async function deleteLevel(store: ViewAtlasStore, id: string): Promise<void> {
  const levels = store.getState().levels ?? [];
  const index = levels.findIndex((level) => level.id === id);
  const level = levels[index];
  const target = levels[index - 1] ?? levels[index + 1];
  if (!level || !target) return;
  const choice = await chooseAction<'move' | 'delete'>({
    title: t('levels.deleteTitle', { name: levelLabel(levels, level) }),
    message: [t('levels.deleteBody', { target: levelLabel(levels, target) })],
    choices: [
      { label: t('levels.deleteWithObjects'), value: 'delete', style: 'warning' },
      { label: t('levels.deleteMove', { target: levelLabel(levels, target) }), value: 'move', style: 'cta' },
    ],
  });
  if (!choice) return;
  const state = store.getState();
  applyScene(store, state, withLevelDeleted(state, id, choice === 'move' ? target.id : null));
}
