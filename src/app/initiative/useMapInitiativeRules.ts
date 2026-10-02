import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_INITIATIVE_RULES } from '../gameSystems/initiativeRules';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';

/** The initiative rules of the collection the view's map belongs to; follows edits to the collection's settings. */
export function useMapInitiativeRules(): InitiativeRules {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', () => setRevision((value) => value + 1));
    return () => app.workspace.offref(ref);
  }, [app]);

  return useMemo(
    () => (app ? mapInitiativeRules(app, mapPath) : { ...DEFAULT_INITIATIVE_RULES }),
    // `revision` stands for the collection settings, which are read here.
    [app, mapPath, revision],
  );
}
