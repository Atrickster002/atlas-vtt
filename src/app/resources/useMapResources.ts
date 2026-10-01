import { useEffect, useMemo, useState } from 'react';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { AssetService } from '../services/AssetService';
import { mapResources } from './collectionResources';
import type { ResourceDefinition } from './resourceTypes';

/** The resources of the collection the view's map belongs to; follows edits to the collection's settings. */
export function useMapResources(): readonly ResourceDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', () => setRevision((value) => value + 1));
    return () => app.workspace.offref(ref);
  }, [app]);

  return useMemo(
    () => (app ? mapResources(AssetService.getInstance(app), mapPath) : []),
    // `revision` stands for the collection settings, which are read here.
    [app, mapPath, revision],
  );
}
