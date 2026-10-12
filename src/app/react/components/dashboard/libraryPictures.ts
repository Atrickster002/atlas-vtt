import { TFile, type App } from 'obsidian';
import { useEffect, useState } from 'react';
import { AssetService } from '../../../services/AssetService';
import { mapThumbnailPath } from '../../../utils/dataFileMigration';

/** A scene's thumbnail as a vault resource URL, or null when it has none yet. */
export function sceneThumbnailUrl(app: App, mapPath: string): string | null {
  return resourceUrl(app, mapThumbnailPath(mapPath));
}

/** A vault file as a resource URL, or null when there is no such file. */
export function resourceUrl(app: App, path: string | undefined): string | null {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : null;
}

/** A map or scene of any collection a campaign may take as its world map. */
export interface WorldMapChoice {
  id: string;
  name: string;
  kind: 'map' | 'scene';
  thumbnailUrl: string | null;
  /** The scene's file, which opens it; maps have none. */
  scenePath?: string;
}

async function readWorldMaps(app: App): Promise<WorldMapChoice[]> {
  const assets = AssetService.getInstance(app);
  const [maps, scenes] = await Promise.all([assets.getAssets(undefined, 'map'), assets.getAssets(undefined, 'scene')]);
  const choices: WorldMapChoice[] = [
    ...scenes.map((scene): WorldMapChoice => {
      const path = scene.data?.mapPath;
      return { id: scene.id, name: scene.name, kind: 'scene', thumbnailUrl: path ? sceneThumbnailUrl(app, path) : null, ...(path && { scenePath: path }) };
    }),
    ...maps.map((map): WorldMapChoice => ({ id: map.id, name: map.name, kind: 'map', thumbnailUrl: resourceUrl(app, map.thumbnailPath) })),
  ];
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every map and scene of the library, by name; read again when assets or thumbnails change. */
export function useWorldMaps(app: App): WorldMapChoice[] {
  const [choices, setChoices] = useState<WorldMapChoice[]>([]);

  useEffect(() => {
    let current = true;
    const load = (): void => {
      readWorldMaps(app)
        .then((next) => { if (current) setChoices(next); })
        .catch((error: unknown) => console.error('[Dashboard] Reading the maps failed:', error));
    };
    load();
    const refs = [app.workspace.on('atlas-vtt:refresh-assets', load), app.workspace.on('atlas-vtt:scene-thumbnail-updated', load)];
    return () => {
      current = false;
      for (const ref of refs) app.workspace.offref(ref);
    };
  }, [app]);

  return choices;
}
