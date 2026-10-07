/**
 * Where a statblock's roll is made and shown. A map open in Atlas rolls it
 * with its own dice tool, so the roll lands in that map's dice log and on its
 * tokens, and is thrown on the map. Where that map is not on screen (another
 * tab), or no map is open at all, the surface the statblock is drawn on may
 * show the roll itself (`OffMapRolls`: the statblock beside its note).
 */

import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import type { DiceRollResult } from '../types/diceTypes';
import type { DiceRollOrigin, TokenRollContext } from '../types/diceRollOrigin';
import { rollOrigin } from '../tools/diceRollOrigins';

export interface DiceRollSource {
  /** The view that owns this statblock; used for routing, never saved on the roll. */
  viewId?: string | undefined;
  /**
   * The view, scene and tokens the statblock was opened for. A roll for one of those
   * tokens carries its origin with its event; never saved on the roll.
   */
  originContext?: TokenRollContext | undefined;
  tokenId?: string | undefined;
  statblockPath?: string | undefined;
  tokenName?: string | undefined;
  tokenImagePath?: string | undefined;
  abilityName?: string | undefined;
}

/** Shows a statblock's rolls where no map on screen shows them, and rolls them while no map is open. */
export interface OffMapRolls {
  /** Rolls by the statblock's own dice rules, telling no map: none is open. Null for a formula it refuses. */
  roll(formula: string, source: NonNullable<DiceRollResult['source']>): DiceRollResult | null;
  /** Shows a roll; `muted` when an open map made it and plays its sounds. */
  show(result: DiceRollResult, muted: boolean): void;
}

interface DiceToolLike {
  rollDice(formula: string, source?: DiceRollResult['source'], origin?: DiceRollOrigin): DiceRollResult | null;
}

interface MapDice {
  tool: DiceToolLike;
  /** Whether the map's view is on screen, where its rolls are seen. */
  onScreen: boolean;
  viewId: string | undefined;
}

interface MapViewLike {
  viewId?: string;
  containerEl?: { isShown?: () => boolean };
  serviceManager?: { getToolController?: () => { getDiceTool?: () => DiceToolLike } };
}

/** The dice tool of an open map view (only `viewId`'s where one is named), one on screen first; null while none is open. */
function mapDice(app: App, viewId: string | undefined): MapDice | null {
  let hidden: MapDice | null = null;
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const view = leaf.view as unknown as MapViewLike;
    if (viewId && view?.viewId !== viewId) continue;
    const tool = view?.serviceManager?.getToolController?.()?.getDiceTool?.();
    if (!tool) continue;
    const isShown = view.containerEl?.isShown;
    // An element without Obsidian's `isShown` (a bare test double) counts as shown.
    const onScreen = typeof isShown === 'function' ? isShown.call(view.containerEl) : true;
    if (onScreen) return { tool, onScreen, viewId: view.viewId };
    hidden ??= { tool, onScreen, viewId: view.viewId };
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
 * Rolls a statblock's dice, tagged with its source: through the dice tool of the
 * map it was opened in (else of an open map), shown on `offMap` too while that map
 * is not on screen; without a map, by `offMap` alone. A roll for one of the tokens
 * it was opened for carries that token's origin. Null when nothing could roll it.
 */
export function rollStatblockDice(app: App, formula: string, source: DiceRollSource, offMap?: OffMapRolls | null): DiceRollResult | null {
  const rollSource = rollSourceOf(source);
  const context = source.originContext;
  const map = mapDice(app, context?.viewId ?? source.viewId);
  if (map) {
    // Proof of a token comes only from the context it was opened with, in the view it names.
    const sameView = context !== undefined && map.viewId === context.viewId && (!source.viewId || source.viewId === context.viewId);
    const origin = sameView ? rollOrigin(context, source.tokenId) : undefined;
    const result = origin ? map.tool.rollDice(formula, rollSource, origin) : map.tool.rollDice(formula, rollSource);
    if (result && !map.onScreen) offMap?.show(result, true);
    return result;
  }
  if (!offMap) return null;
  const result = offMap.roll(formula, rollSource);
  if (result) offMap.show(result, false);
  return result;
}
