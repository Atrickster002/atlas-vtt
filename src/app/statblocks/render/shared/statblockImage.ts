import type { App, TFile } from 'obsidian';
import { AssetService, type TokenAsset } from '../../../services/AssetService';

const WIKI_BRACKETS = /(^\[\[|\]\]$)/g;
const WEB_ADDRESS = /^https?:/;

/** A value with a stray `%` is not percent-encoded; it is read as written. */
function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The address a statblock's image value can be shown from: a web address as
 * it is, a vault path or wiki link (`[[Wolf.png|alias]]`) through the vault,
 * or '' where the vault holds no such file. Without an app the value is
 * returned as written.
 */
export function statblockImageSrc(app: App | undefined, raw: string, sourcePath: string | undefined): string {
  if (!raw) return '';
  const src = linkTarget(raw);
  if (WEB_ADDRESS.test(src) || !app) return src;
  const file = statblockImageFile(app, raw, sourcePath);
  return file ? app.vault.getResourcePath(file) : '';
}

/** What a value names: a path or a wiki link's target, without its alias. */
function linkTarget(raw: string): string {
  return decoded(raw).replace(WIKI_BRACKETS, '').split('|')[0] ?? '';
}

/** The vault file a statblock's image value names; null for none, a missing file or a web address. */
export function statblockImageFile(app: App, raw: string, sourcePath: string | undefined): TFile | null {
  const src = raw ? linkTarget(raw) : '';
  if (!src || WEB_ADDRESS.test(src)) return null;
  return app.metadataCache.getFirstLinkpathDest(src, sourcePath ?? '');
}

/** The token asset whose art the statblock's image is: its ring is the one the statblock shows. */
export function statblockImageToken(app: App, raw: string, sourcePath: string | undefined): TokenAsset | null {
  const file = statblockImageFile(app, raw, sourcePath);
  return file ? AssetService.getInstance(app).findTokenAssetByImagePath(file.path) : null;
}
