import type { App, WorkspaceLeaf } from 'obsidian';
import { formatList, t } from '../../i18n';
import { levelById } from '../../levels/sceneLevels';
import { tokenDisplayName } from '../../pixi/token-renderer/tokenDisplayName';
import { levelLabel } from '../../react/components/levels/levelEditing';
import { showNotice } from '../../ui/notice';
import type { SceneStore } from './atlasView.ts';
import { presentOnPlayerView } from './presentedScene.ts';
import type { StairsTaken } from './stairsTaken.ts';

/** How long the offer stays: long enough to read and reach. */
const OFFER_MS = 12000;

/** Shows level `levelId` in the view of `leaf`, where its store has the action (Atlas's own does). */
function showLevel(store: SceneStore, levelId: string): void {
  const state: unknown = store.getState();
  const show = typeof state === 'object' && state !== null && 'setViewedLevel' in state ? state.setViewedLevel : undefined;
  if (typeof show === 'function') (show as (id: string) => void)(levelId);
}

/**
 * Tells the GM that players' tokens took stairs to a level the players are not shown, where they
 * leave the players' picture, once per level, naming the tokens and the level; the notice offers to
 * show that level to the players, as the eye on the level does.
 */
export function tellStairsTaken(app: App, leaf: WorkspaceLeaf, store: SceneStore, taken: readonly StairsTaken[]): void {
  const { levels, objects } = store.getState();
  const byLevel = new Map<string, string[]>();
  for (const { tokenId, level } of taken) {
    const token = objects.tokens[tokenId];
    if (token) byLevel.set(level, [...(byLevel.get(level) ?? []), tokenDisplayName(token) ?? t('initiative.token')]);
  }
  for (const [levelId, names] of byLevel) {
    const level = levelById(levels, levelId);
    if (!levels || !level) continue;
    const name = levelLabel(levels, level);
    const message = createFragment();
    message.append(`${t('levels.stairsTookUnseen', { tokens: formatList(names), name })} `);
    const link = createEl('a', { text: t('levels.stairsShowPlayers', { name }), href: '#' });
    message.append(link);
    const notice = showNotice(message, OFFER_MS);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      notice.hide();
      showLevel(store, levelId);
      presentOnPlayerView(app, leaf);
    });
  }
}
