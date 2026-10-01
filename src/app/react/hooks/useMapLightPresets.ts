import { GENERIC_LIGHT_PRESETS } from '../../gameSystems/lightPresets/generic';
import { mapLightPresets } from '../../services/mapCollectionRules';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';

/** The light presets offered on the view's map: its collection's, or the generic ones without one. */
export function useMapLightPresets(): readonly LightPresetDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  return app ? mapLightPresets(app, mapPath) : GENERIC_LIGHT_PRESETS;
}
