import type { App } from 'obsidian';
import type { ContextMenuEntry } from './AtlasContextMenu';
import { AssetService } from '../../../services/AssetService';
import { isPlayerCharacter, libraryTokenOf, type PlacedTokenSource } from '../../../characters/playerCharacters';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

/**
 * Marks library tokens as player characters or no longer, and tells every list of them.
 * The change is the library's, not a scene's, so it is no undo step.
 */
export async function setPlayerCharacters(app: App, assets: AssetService, ids: readonly string[], on: boolean): Promise<void> {
  try {
    await assets.setPlayerCharacters(ids, on);
  } finally {
    // A save that failed part way may still have changed the index the lists show.
    app.workspace.trigger('atlas-vtt:refresh-assets');
  }
}

/** "Make player character" or "No longer a player character", shared by the map token menu and the asset manager. */
export function playerCharacterEntry(isOn: boolean, onToggle: (on: boolean) => void): ContextMenuEntry {
  return {
    type: 'item',
    label: isOn ? t('token.noLongerPlayerCharacter') : t('token.makePlayerCharacter'),
    icon: isOn ? 'user-x' : 'user-check',
    onClick: () => onToggle(!isOn),
  };
}

/** The entry for a token on the map, for the library token it was placed from; null when no library token is known for it. */
export function placedPlayerCharacterEntry(app: App, token: PlacedTokenSource): ContextMenuEntry | null {
  const assets = AssetService.getInstance(app);
  const asset = libraryTokenOf(token, assets.loadedTokenAssets());
  if (!asset) return null;
  return playerCharacterEntry(isPlayerCharacter(asset), (on) => runInBackground(
    setPlayerCharacters(app, assets, [asset.id], on),
    `Marking token ${asset.id} as a player character`,
    t('token.playerCharacterFailed'),
  ));
}
