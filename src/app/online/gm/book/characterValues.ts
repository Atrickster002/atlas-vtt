import type { App } from 'obsidian';
import { CampaignPlay } from '../../../campaigns/campaignPlay';
import { PartySync } from '../../../campaigns/partyValues/PartySync';
import { withCurrent } from '../../../resources/resourceValues';
import type { ResourceEdit } from './resourceEdit.ts';

/** An edit of the values the played campaign keeps of a character. */
export type CharacterResourceEdit = Extract<ResourceEdit, { readonly kind: 'character' }>;

/**
 * Writes a player's edit into the values the campaign this device plays keeps of their character
 * (`PartySync`), for a character whose token the shared scene does not hold: every open scene that
 * holds it shows the value, and no undo step is made. Returns the current value the campaign keeps
 * then, clamped to the value's range, or null when it is refused: no campaign is played, the
 * campaign cannot be changed, the token was placed from no player character, or the campaign keeps
 * no such value of it.
 */
export function writeCharacterValue(app: App, edit: CharacterResourceEdit): number | null {
  const sync = PartySync.forApp(app);
  const campaignId = sync === undefined ? null : CampaignPlay.forApp(app).playing();
  if (sync === undefined || campaignId === null) return null;
  const characterId = sync.characterOf(edit.placed);
  const value = characterId === null ? undefined : sync.value(campaignId, characterId, edit.key);
  if (characterId === null || value === undefined) return null;
  const { current } = withCurrent(value, edit.current);
  if (current === value.current) return current;
  return sync.setValue(campaignId, characterId, edit.key, { ...value, current }) ? current : null;
}
