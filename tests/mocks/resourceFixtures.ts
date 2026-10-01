import type { StoreApi } from 'zustand';
import type { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import type { ResourceSlot } from '../../src/app/pixi/token-renderer/resources/ResourceStack';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { visibleResources } from '../../src/app/resources/visibleResources';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { barDimensions } from '../../src/app/styles/designTokens';

export const HP: ResourceDefinition = { ...HP_RESOURCE };
export const STRESS: ResourceDefinition = { ...STRESS_RESOURCE };
export const STR: ResourceDefinition = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', color: '#dc2626', defeatedWhenSpent: false };
export const AMMO: ResourceDefinition = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', field: 'ammo', color: '#f59e0b', defeatedWhenSpent: false };

/** Where `TokenUIRenderer` draws bars for `keys`: stacked from 2 units below the token. */
export function barSlots(keys: readonly string[]): ResourceSlot[] {
  const { width, height, gap } = barDimensions.token;
  return keys.map((key, index) => ({ key, kind: 'bar', top: 2 + index * (height + gap), left: -width / 2, width, height }));
}

/** Gives the controls the definitions and the bar layout a token UI would report. */
export function wireControls(controls: TokenControlsUI, store: StoreApi<ViewAtlasState>, definitions: readonly ResourceDefinition[]): void {
  controls.resourceDefsProvider = () => definitions;
  controls.slotsProvider = (tokenId) => {
    const token = store.getState().objects.tokens[tokenId];
    return token ? barSlots(visibleResources(token, definitions, 'dm').map((resource) => resource.definition.key)) : [];
  };
}
