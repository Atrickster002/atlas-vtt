import type { App } from 'obsidian';
import { placementVision } from '../creatures/placementVision';
import { mapVisionDefaults } from '../gameSystems/visionDefaults';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenVision } from '../types/lightingTypes';
import type { AssetService } from './AssetService';
import { mapSenseRules } from './mapSenseRules';

/** The vision a token starts with, from the fields of its linked statblock (null without one); undefined for none. */
export type PlacementVision = (statblock: Readonly<Record<string, unknown>> | null) => TokenVision | undefined;

/**
 * How tokens placed into the map in `state` start seeing: the default vision of its collection,
 * without its senses where the token's statblock has senses of its own (`placementVision`).
 */
export function mapPlacementVision(
  app: App,
  assetService: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'>,
): PlacementVision {
  const defaults = mapVisionDefaults(assetService, state.mapPath);
  if (!defaults) return () => undefined;
  const rules = mapSenseRules(app, assetService, state);
  return (statblock) => placementVision(defaults, statblock, rules);
}
