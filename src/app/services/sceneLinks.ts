import type { App, TFile } from 'obsidian';
import { collectionFolderPath, collectionIdOfPath } from './assetPaths';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from './MapPersistence';

/** The file a note link opens: `Notes/Cave.md#Entrance` opens `Notes/Cave.md`. */
export const linkedFilePath = (link: string): string => link.split('#', 1)[0]!;

/** The scene map a pin's link opens, or null when it opens a note. */
export function linkedMapPath(link: string): string | null {
  const path = linkedFilePath(link);
  return path.toLowerCase().endsWith('.atlasmap') ? path : null;
}

/**
 * Whether a scene at `mapPath` may link to `link`. Notes may lie anywhere, but
 * a scene links only to scenes of its own collection: opening a scene of
 * another collection would silently switch its widgets and rules.
 */
export function mayLinkFromScene(mapPath: string | null | undefined, link: string): boolean {
  const target = linkedMapPath(link);
  return !target || collectionIdOfPath(target) === collectionIdOfPath(mapPath);
}

/**
 * The scene map a link from the scene at `mapPath` opens. A link into another
 * collection, made before such links were refused, opens the scene at the same
 * place in the linking scene's own collection, where a copy of it arrives;
 * null when the link has no such place.
 */
export function sceneLinkTarget(mapPath: string | null | undefined, target: string): string | null {
  const own = collectionIdOfPath(mapPath);
  const other = collectionIdOfPath(target);
  if (own === other) return target;
  if (!own || !other) return null;
  return `${collectionFolderPath(own)}${target.slice(collectionFolderPath(other).length)}`;
}

/** The scene map file a pin on the scene at `mapPath` opens (`sceneLinkTarget`); null when `link` opens no scene in the vault. */
export function linkedSceneFile(app: App, mapPath: string | null | undefined, link: string): TFile | null {
  const linked = linkedMapPath(link);
  const target = linked ? sceneLinkTarget(mapPath, linked) : null;
  return target ? app.vault.getFileByPath(target) : null;
}

/** The scene maps the pins of a saved map state open. */
export function sceneLinksOf({ state }: PersistedMapEnvelope): Set<string> {
  const links = new Set<string>();
  for (const pin of Object.values(state?.objects?.pins ?? {})) {
    const target = pin.notePath ? linkedMapPath(pin.notePath) : null;
    if (target) links.add(target);
  }
  return links;
}

/**
 * The map or snapshot JSON without the pins that open a scene `keep` rejects,
 * or null when it has none.
 */
export function dropSceneLinksFromJson(content: string, keep: (mapPath: string) => boolean): string | null {
  const data: unknown = JSON.parse(content);
  const objects = isPersistedMapEnvelope(data) ? data.state?.objects : undefined;
  const pins = objects?.pins;
  if (!objects || !pins) return null;
  const kept = Object.entries(pins).filter(([, pin]) => {
    const target = pin.notePath ? linkedMapPath(pin.notePath) : null;
    return !target || keep(target);
  });
  if (kept.length === Object.keys(pins).length) return null;
  objects.pins = Object.fromEntries(kept);
  return JSON.stringify(data, null, 2);
}
