/**
 * Where a statblock's roll is made and shown. A map open in Atlas rolls it
 * with its own dice tool, so the roll lands in that map's dice log and on its
 * tokens, and is thrown on the map. Where that map is not on screen (another
 * tab), or no map is open at all, the surface the statblock is drawn on may
 * show the roll itself (`OffMapRolls`: the statblock beside its note).
 */

import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import type { DiceRollResult } from '../tools/DiceTool';

export interface DiceRollSource {
  tokenId?: string | undefined;
  statblockPath?: string | undefined;
  tokenName?: string | undefined;
  tokenImagePath?: string | undefined;
  abilityName?: string | undefined;
}

/** Shows a statblock's rolls where no map on screen shows them, and rolls them while no map is open. */
export interface OffMapRolls {
  /** Rolls by the statblock's own dice rules, telling no map: none is open. */
  roll(formula: string, source: NonNullable<DiceRollResult['source']>): DiceRollResult;
  /** Shows a roll; `muted` when an open map made it and plays its sounds. */
  show(result: DiceRollResult, muted: boolean): void;
}

interface DiceToolLike {
  rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult;
}

interface MapDice {
  tool: DiceToolLike;
  /** Whether the map's view is on screen, where its rolls are seen. */
  onScreen: boolean;
}

interface MapViewLike {
  containerEl?: { isShown?: () => boolean };
  serviceManager?: { getToolController?: () => { getDiceTool?: () => DiceToolLike } };
}

/** The dice tool of an open map view, one on screen first; null while no map is open. */
function mapDice(app: App): MapDice | null {
  let hidden: MapDice | null = null;
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const view = leaf.view as unknown as MapViewLike;
    const tool = view?.serviceManager?.getToolController?.()?.getDiceTool?.();
    if (!tool) continue;
    const isShown = view.containerEl?.isShown;
    // An element without Obsidian's `isShown` (a bare test double) counts as shown.
    const onScreen = typeof isShown === 'function' ? isShown.call(view.containerEl) : true;
    if (onScreen) return { tool, onScreen };
    hidden ??= { tool, onScreen };
  }
  return hidden;
}

function rollSourceOf(source: DiceRollSource): NonNullable<DiceRollResult['source']> {
  const rollSource: NonNullable<DiceRollResult['source']> = { type: 'statblock' };
  if (source.tokenId) rollSource.tokenId = source.tokenId;
  if (source.statblockPath) rollSource.statblockPath = source.statblockPath;
  if (source.tokenName) rollSource.tokenName = source.tokenName;
  if (source.tokenImagePath) rollSource.tokenImagePath = source.tokenImagePath;
  if (source.abilityName) rollSource.abilityName = source.abilityName;
  return rollSource;
}

/**
 * Rolls a statblock's dice, tagged with its source: through the open map's
 * dice tool, shown on `offMap` too while that map is not on screen; without a
 * map, by `offMap` alone. Null when nothing could roll it.
 */
export function rollStatblockDice(app: App, formula: string, source: DiceRollSource, offMap?: OffMapRolls | null): DiceRollResult | null {
  const rollSource = rollSourceOf(source);
  const map = mapDice(app);
  if (map) {
    const result = map.tool.rollDice(formula, rollSource);
    if (!map.onScreen) offMap?.show(result, true);
    return result;
  }
  if (!offMap) return null;
  const result = offMap.roll(formula, rollSource);
  offMap.show(result, false);
  return result;
}
