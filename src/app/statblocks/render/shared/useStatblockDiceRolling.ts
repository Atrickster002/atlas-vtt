import { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import type { App } from 'obsidian';
import { attachDiceRolling } from '../../../services/statblockDiceLinks';
import { rollHitPoints } from '../../../services/statblockHitPoints';
import type { DiceRollSource } from '../../../services/statblockRolls';
import type { TokenVitals } from '../../../services/statblockVitalsSync';
import { OffMapRollsContext } from './offMapRolls';

export interface StatblockDiceRolling {
  app: App | undefined;
  /** The statblock note: rolls are tagged with it, and its tokens take rolled hit points. */
  notePath: string | undefined;
  /** The tokens the statblock is shown for; read when a roll is made, the first one names it. */
  tokens: readonly TokenVitals[];
  /** Names a roll made while no token is given. */
  name: string | undefined;
}

/** A ref callback for the statblock's container; what it returns detaches the listeners. */
export type StatblockDiceRef = (el: HTMLElement | null) => (() => void) | undefined;

function rollSource({ notePath, tokens, name }: StatblockDiceRolling): DiceRollSource {
  const [token] = tokens;
  return {
    tokenId: token?.id,
    statblockPath: notePath,
    tokenName: token?.name ?? name,
    tokenImagePath: token?.imagePath,
  };
}

/**
 * Click-to-roll for a statblock: a ref for its container, which then rolls the
 * dice links inside it through the open map's dice tool, or shows them where
 * `OffMapRollsContext` says when no map on screen does. Dice on the hit point
 * line put rolled hit points on the tokens. Only listens, so it is safe on DOM
 * React owns; the options are read at the moment of a roll.
 */
export function useStatblockDiceRolling(options: StatblockDiceRolling): StatblockDiceRef {
  const offMap = useContext(OffMapRollsContext);
  const latest = useRef({ options, offMap });
  useLayoutEffect(() => {
    latest.current = { options, offMap };
  });

  const { app } = options;
  return useCallback((el: HTMLElement | null): (() => void) | undefined => {
    if (!el || !app) return undefined;
    return attachDiceRolling(
      el,
      app,
      () => rollSource(latest.current.options),
      (formula, abilityName) => {
        const { options: { notePath, tokens }, offMap: shownOn } = latest.current;
        rollHitPoints(app, formula, notePath ?? '', tokens, abilityName, shownOn);
      },
      () => latest.current.offMap,
    );
  }, [app]);
}
