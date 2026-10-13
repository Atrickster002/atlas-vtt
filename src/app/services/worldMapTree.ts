import { TFile, type App } from 'obsidian';
import { readMapStretch, NO_STRETCH } from '../grid/mapStretch';
import { hexLayoutOfGrid, pinDisplayPoint } from '../grid/hexLinks';
import type { WorldMapEntrance, WorldMapLevel, WorldMapTree } from '../online/gm/book/worldMapGate.ts';
import type { NotePin } from '../types';
import type { GridState } from '../types/gridTypes';
import { isRecord } from '../utils/guards';
import { AssetService, type Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { linkedMapPath, sceneLinkTarget } from './sceneLinks';
import { inAtlasFolders, worldMapArtwork } from './worldMap';
import { readSceneLevels } from '../levels/levelFile';
import { firstLevelId, onLevel } from '../levels/sceneLevels';

/** The world map's maps as read, and the scene files they were read from, whose changes may change them. */
export interface WorldMapTreeRead {
  readonly tree: WorldMapTree;
  readonly scenePaths: readonly string[];
}

/**
 * A scene file's pins that are shown (not the GM's alone), with a link and a place that can be read,
 * on its first floor: the floor whose map the world map shows.
 */
function shownPins(state: Record<string, unknown>): NotePin[] {
  const objects = isRecord(state.objects) ? state.objects : {};
  const pins = isRecord(objects.pins) ? Object.values(objects.pins) : [];
  const levels = readSceneLevels(state.levels, null);
  const first = firstLevelId(levels);
  return pins
    .filter((pin): pin is NotePin => isRecord(pin) && pin.gmOnly !== true && typeof pin.notePath === 'string' && Number.isFinite(pin.x) && Number.isFinite(pin.y))
    .filter((pin) => first === null || onLevel(pin, first, levels));
}

/** The saved state of a scene file, or null when it cannot be read. */
async function sceneState(app: App, mapPath: string): Promise<Record<string, unknown> | null> {
  const file = app.vault.getAbstractFileByPath(mapPath);
  if (!(file instanceof TFile)) return null;
  try {
    const envelope: unknown = JSON.parse(await app.vault.cachedRead(file));
    return isPersistedMapEnvelope(envelope) && isRecord(envelope.state) ? envelope.state : null;
  } catch {
    return null;
  }
}

/** One map of the tree and the scenes its pins open; null when it has no artwork in Atlas's own folders. */
async function levelOf(app: App, asset: Asset, scenes: ReadonlyMap<string, Asset>): Promise<{ level: WorldMapLevel; leadsTo: Asset[] } | null> {
  const image = await worldMapArtwork(app, asset);
  if (image === null || !inAtlasFolders(image, asset.collection)) return null;
  const mapPath = asset.type === 'scene' ? asset.data?.mapPath : undefined;
  const state = mapPath ? await sceneState(app, mapPath) : null;
  if (!mapPath || state === null) return { level: { key: asset.id, title: asset.name, image, stretch: NO_STRETCH, entrances: [] }, leadsTo: [] };
  const grid = isRecord(state.grid) ? (state.grid as Partial<GridState>) : null;
  const layout = hexLayoutOfGrid(grid && typeof grid.size === 'number' ? (grid as GridState) : null);
  const entrances: WorldMapEntrance[] = [];
  const leadsTo: Asset[] = [];
  for (const pin of shownPins(state)) {
    const linked = linkedMapPath(pin.notePath);
    const target = linked === null ? undefined : scenes.get(sceneLinkTarget(mapPath, linked) ?? '');
    if (target === undefined || target.id === asset.id) continue;
    const point = pinDisplayPoint(pin, layout);
    entrances.push({ x: point.x, y: point.y, to: target.id });
    if (!leadsTo.includes(target)) leadsTo.push(target);
  }
  return { level: { key: asset.id, title: asset.name, image, stretch: readMapStretch(grid?.mapStretch), entrances }, leadsTo };
}

/**
 * The world map of a campaign, by its asset id, with every scene its pins lead into and theirs in
 * turn, nearest first, each once, `maxLevels` of them at most besides the world map. A pin leads on
 * where players may see it (not the GM's alone) and it opens a scene of the same collection (an older
 * link into another collection opens the scene at the same place in its own, as on the map); a map
 * without scene has no pins. Every image must be its map's artwork in Atlas's own folders: a map
 * without one is left out with the maps only it leads to, and a world map without one is none.
 */
export async function worldMapTree(app: App, assetId: string, maxLevels: number): Promise<WorldMapTreeRead | null> {
  const assets = AssetService.getInstance(app);
  const root = await assets.getAssetById(assetId);
  if (root?.id !== assetId || (root.type !== 'map' && root.type !== 'scene')) return null;
  const scenes = new Map((await assets.getAssets(undefined, 'scene')).flatMap((scene) => (scene.type === 'scene' && scene.data?.mapPath ? [[scene.data.mapPath, scene] as const] : [])));
  const levels: WorldMapLevel[] = [];
  const scenePaths: string[] = [];
  const queue: Asset[] = [root];
  const seen = new Set([root.id]);
  for (let index = 0; index < queue.length && levels.length <= maxLevels; index++) {
    const asset = queue[index]!;
    if (asset.type === 'scene' && asset.data?.mapPath) scenePaths.push(asset.data.mapPath);
    const read = await levelOf(app, asset, scenes);
    if (read === null && asset === root) return null;
    if (read === null) continue;
    levels.push(read.level);
    for (const next of read.leadsTo) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      queue.push(next);
    }
  }
  return { tree: { root: root.id, levels }, scenePaths };
}
