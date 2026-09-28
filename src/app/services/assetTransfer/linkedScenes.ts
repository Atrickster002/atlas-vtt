import type { App } from 'obsidian';
import type { AssetService, SceneAsset } from '../AssetService';
import { isPersistedMapEnvelope } from '../MapPersistence';
import { saveOpenMaps } from '../collectionBundle/importJournal';
import { sceneLinksOf } from '../sceneLinks';
import type { TransferMode } from './transferPlan';

/** Map path → the map paths its pins open. */
export type SceneLinkGraph = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The scenes that must go along with `chosen` so that no link crosses
 * collections, followed from scene to scene: for a copy the scenes the copies
 * link to (the originals keep their links), for a move also the scenes that
 * link to the moved ones. Excludes `chosen` itself.
 */
export function scenesToBringAlong(graph: SceneLinkGraph, chosen: readonly string[], mode: TransferMode): string[] {
  const neighbours = (map: string): string[] => {
    const outgoing = [...(graph.get(map) ?? [])];
    if (mode === 'copy') return outgoing;
    const incoming = [...graph].filter(([, links]) => links.has(map)).map(([from]) => from);
    return [...outgoing, ...incoming];
  };
  const reached = new Set(chosen);
  const queue = [...chosen];
  for (let map = queue.shift(); map !== undefined; map = queue.shift()) {
    for (const next of neighbours(map)) {
      if (reached.has(next) || !graph.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return [...reached].filter((map) => !chosen.includes(map));
}

/** The scene links between the given maps, read from their files; links to any other file are left out. */
async function readSceneLinks(app: App, mapPaths: readonly string[]): Promise<SceneLinkGraph> {
  const known = new Set(mapPaths);
  const graph = new Map<string, Set<string>>();
  for (const path of mapPaths) {
    const file = app.vault.getFileByPath(path);
    let envelope: unknown = null;
    try {
      envelope = file ? JSON.parse(await app.vault.read(file)) : null;
    } catch {
      // An unreadable map links nowhere.
    }
    const links = isPersistedMapEnvelope(envelope) ? sceneLinksOf(envelope) : new Set<string>();
    graph.set(path, new Set([...links].filter((link) => known.has(link) && link !== path)));
  }
  return graph;
}

/**
 * The scenes, outside `assetIds`, that a transfer of those assets to
 * `targetCollectionId` should take along so their links keep working
 * (`scenesToBringAlong`).
 */
export async function linkedScenesFor(app: App, assetService: AssetService, assetIds: readonly string[], targetCollectionId: string, mode: TransferMode): Promise<SceneAsset[]> {
  const chosenBySource = new Map<string, string[]>();
  for (const id of assetIds) {
    const asset = await assetService.getAssetById(id);
    const mapPath = asset?.type === 'scene' ? asset.data?.mapPath : undefined;
    if (!asset || !mapPath || asset.collection === targetCollectionId) continue;
    chosenBySource.set(asset.collection, [...(chosenBySource.get(asset.collection) ?? []), mapPath]);
  }

  const linked: SceneAsset[] = [];
  for (const [sourceCollectionId, chosen] of chosenBySource) {
    const scenes = (await assetService.getAssets(sourceCollectionId, 'scene')).filter((scene) => scene.data?.mapPath);
    const mapPaths = scenes.map((scene) => scene.data!.mapPath!);
    // The links are read from the files, so they must hold what the open maps show.
    await saveOpenMaps(app, new Set(mapPaths));
    const graph = await readSceneLinks(app, mapPaths);
    const along = new Set(scenesToBringAlong(graph, chosen, mode));
    linked.push(...scenes.filter((scene) => along.has(scene.data!.mapPath!) && !assetIds.includes(scene.id)));
  }
  return linked;
}
