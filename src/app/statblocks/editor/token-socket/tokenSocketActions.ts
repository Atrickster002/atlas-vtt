/**
 * What the token socket's panel does to the note and its links. Links go
 * through `TokenStatblockLinkService`, as the asset manager's do: it keeps one
 * token per statblock, writes the note's `image` through `NoteFieldWriter`
 * and updates the tokens on every map. Art chosen without a token is written
 * through the pane, as any value it edits.
 */

import { TFile, type App } from 'obsidian';
import type { TokenAsset } from '../../../services/AssetService';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';
import { setTokenRing } from '../../../services/tokenRingSync';
import { statblockImageFile, statblockImageSrc, statblockImageToken } from '../../render/shared/statblockImage';
import type { TemplateField } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import type { PaneEditController } from '../statblock-pane/paneEditContext';
import { fieldPatches } from '../statblock-pane/valuePatches';
import type { CardToken } from './useNoteTokens';
import { isVaultImage } from './VaultImageModal';

/** The key Fantasy Statblocks reads the art from, which the link service writes. */
const LINK_IMAGE_KEY = 'image';

/** The address the art of `field` shows from now; '' when the note names none, or none the vault holds. */
export function artSrc(pane: PaneEditController, field: TemplateField): string {
  return statblockImageSrc(pane.app, valueText(pane.read(field).value), pane.notePath);
}

/** Whether the note's art is the token's own: the token marked as the statblock's image. */
export function isTheArt(app: App, token: CardToken, art: string): boolean {
  if (!art || !token.imagePath) return false;
  const file = app.vault.getAbstractFileByPath(token.imagePath);
  return file instanceof TFile && app.vault.getResourcePath(file) === art;
}

/** The vault image the note's art names, which a token can be made from; null for none or a web address. */
export function artFile(pane: PaneEditController, field: TemplateField): TFile | null {
  const file = statblockImageFile(pane.app, valueText(pane.read(field).value), pane.notePath);
  return file && isVaultImage(file) ? file : null;
}

/** The token whose art the note's art is: the token the panel's Ring switch frames; null for art of no token. */
export function artToken(pane: PaneEditController, field: TemplateField): TokenAsset | null {
  return statblockImageToken(pane.app, valueText(pane.read(field).value), pane.notePath);
}

/** Frames the token, and every token placed with its art, with the ring or without. */
export async function setRing(pane: PaneEditController, token: TokenAsset, showRing: boolean): Promise<void> {
  await setTokenRing(pane.app, token, showRing);
  pane.announce(showRing ? `${token.name} has a ring.` : `${token.name} has no ring.`);
}

/** Writes `path` as the note's art: one step of the note's history, as any value the pane edits. */
export async function setArt(pane: PaneEditController, field: TemplateField, path: string): Promise<void> {
  const read = pane.read(field);
  await pane.write(field, fieldPatches(field.key, read, path), { base: read.value, mine: path });
}

/**
 * Links the token to the note: it becomes the statblock's token and its art
 * the note's `image`. A template that keeps its art under another key gets it
 * there too, so the socket shows what was linked.
 */
export async function linkToken(pane: PaneEditController, field: TemplateField, token: CardToken): Promise<boolean> {
  if (!token.imagePath) return false;
  const linked = await TokenStatblockLinkService.getInstance(pane.app).linkTokenToStatblock(token.imagePath, pane.notePath, {
    showConfirmation: false,
    updateStatblockAvatar: true,
  });
  if (linked && field.key !== LINK_IMAGE_KEY) await setArt(pane, field, token.imagePath);
  return linked;
}

/** Unlinks the token; the note's `image` goes with it where it was the token's art. */
export async function unlinkToken(app: App, token: CardToken): Promise<boolean> {
  if (!token.imagePath) return false;
  return TokenStatblockLinkService.getInstance(app).unlinkToken(token.imagePath, { updateStatblockAvatar: true });
}

/** Makes a token of the note's art in the pane's collection and links it, as "Create token from statblock image" does. */
export async function makeToken(pane: PaneEditController, collectionId: string): Promise<boolean> {
  const made = await TokenStatblockLinkService.getInstance(pane.app).createTokenFromStatblockImage(pane.notePath, collectionId);
  return made !== null;
}
