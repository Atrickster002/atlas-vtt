import { Notice } from 'obsidian';
import type { AnyAsset, MapAsset } from '../types';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';

/** Background and name of a new scene built on a map. */
export function scenePrefillFromMap(map: MapAsset): CreateScenePrefill {
  return { backgroundPath: map.mapFilePath, defaultName: map.name };
}

export interface SceneCreationActions {
  openCreateScene: (prefill: CreateScenePrefill) => void;
  addMap: () => void;
  showMaps: () => void;
}

/**
 * The Create menu's "Create Scene": a scene is built on a map, so a single
 * selected map opens the scene dialog with it; otherwise the user is taken to
 * the maps to pick one, or to add one when the collection has none.
 */
export function startSceneCreation(
  selectedAssets: readonly AnyAsset[],
  mapCount: number,
  actions: SceneCreationActions,
): void {
  const maps = selectedAssets.filter((asset): asset is MapAsset => asset.type === 'maps');
  const [map] = maps;
  if (map && maps.length === 1) {
    actions.openCreateScene(scenePrefillFromMap(map));
    return;
  }
  actions.showMaps();
  if (mapCount === 0) {
    new Notice('Add a map first, then create a scene from it.');
    actions.addMap();
    return;
  }
  new Notice('Double-click the map for your scene, or right-click it to create the scene from its menu.');
}
