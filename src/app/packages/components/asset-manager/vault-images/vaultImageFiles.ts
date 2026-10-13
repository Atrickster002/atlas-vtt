import type { App, TFile } from 'obsidian';
import { ATLAS_VTT_DIR } from '../../../../services/assetPaths';
import { isVaultImage } from '../../../../utils/vaultImage';

/** The vault's images outside Atlas' own folder, which holds the art and maps Atlas already made, by path. */
export function vaultImages(app: App): TFile[] {
  const own = `${ATLAS_VTT_DIR}/`;
  return app.vault.getFiles()
    .filter((file) => isVaultImage(file) && !file.path.startsWith(own))
    .sort((a, b) => a.path.localeCompare(b.path));
}
