import { normalizePath, type App } from 'obsidian';
import { imageMimeType } from './assetServe.ts';
import type { VaultImage } from './TokenShare.ts';

/** An image of the vault as players may be sent it: its bytes and its type by its extension; null for no image file. */
export async function readVaultImage(app: App, path: string): Promise<VaultImage | null> {
  const mime = imageMimeType(path);
  const file = app.vault.getFileByPath(normalizePath(path));
  if (mime === null || file === null) return null;
  return { bytes: new Uint8Array(await app.vault.readBinary(file)), mime };
}
