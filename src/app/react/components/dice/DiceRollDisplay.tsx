import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { cn } from '../../../../utils/cn';
import { throwStyle } from '../../../dice3d/diceDisplay';
import { diceSceneToShow } from '../../../dice3d/rollPresentation';
import { warmDiceSounds } from '../../../dice3d/audio/diceSamples';
import { playDiceReveal } from '../../../audio/diceRevealSound';
import { canShowDice, warmStages } from '../../../dice3d/stagePool';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { DiceRollStack } from '../dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../dice3d/rollStackState';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { DiceToast } from './DiceToast';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';
import { useDiceToasts } from './useDiceToasts';

/** Hands each roll to show to `onRoll`; returns what stops it. */
export type DiceRollSubscription = (onRoll: (result: DiceRollResult, options: { muted: boolean }) => void) => () => void;

/** Every roll Atlas' dice tools make, announced on the main document. */
const everyRoll: DiceRollSubscription = (onRoll) => {
  const handler = (e: Event): void => onRoll((e as CustomEvent<DiceRollResult>).detail, { muted: false });
  document.addEventListener('atlas-dice-rolled', handler);
  return (): void => document.removeEventListener('atlas-dice-rolled', handler);
};

interface DiceRollDisplayProps {
  /** Element the rolls render into, e.g. in the player window. Defaults to where the component is mounted. */
  container?: HTMLElement;
  /** Adapts each roll before it is shown, e.g. to leave out who rolled it. */
  prepare?: (result: DiceRollResult) => DiceRollResult;
  /** Throws without sound, where another window already plays it. */
  muted?: boolean;
  /** The rolls to show; every roll of Atlas' dice tools by default. */
  subscribe?: DiceRollSubscription;
  /**
   * Plays the result sound of a roll shown as a card. A map's own display
   * leaves that to its `DiceToastObserver`; a display outside a map has none.
   */
  cardSounds?: boolean;
}

const CARD_VOLUME = 0.7;

/**
 * Every dice roll, at the top centre of the map: thrown as 3D dice, or as a
 * result card when 3D dice are off or the roll holds dice no real body shows.
 */
export function DiceRollDisplay({ container, prepare, muted = false, subscribe = everyRoll, cardSounds = false }: DiceRollDisplayProps): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const display = useDiceDisplay(app ?? undefined);
  const look = useDiceLook(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);
  /** Where the dice stages live: a canvas and its context belong to one document. */
  const stageDoc = container?.ownerDocument ?? view?.containerEl.doc ?? document;

  useEffect(() => subscribe((raw, options) => {
    const result = prepare ? prepare(raw) : raw;
    const scene = diceSceneToShow(result, display);
    // Without WebGL a stage stays blank (white on some systems), so the roll shows as a card
    if (!scene || !canShowDice(stageDoc)) {
      addToast(result);
      if (cardSounds && !muted && !options.muted) void playDiceReveal(result.crit ?? null, CARD_VOLUME).catch(() => undefined);
      return;
    }
    if (!muted && !options.muted) warmDiceSounds();
    setRolls((prev) => pushRoll(prev, { result, scene, style: throwStyle(display), ...(options.muted && { muted: true as const }) }));
  }), [subscribe, addToast, prepare, display, muted, cardSounds, stageDoc]);

  // Dice stages are built while nothing rolls, so that the first roll does not wait for one.
  useEffect(() => {
    if (display !== 'card') warmStages(stageDoc);
  }, [display, stageDoc]);

  // Escape dismisses every roll on screen, unless something in front of the map
  // takes it (a modal, the palette, the dashboard) or someone is typing. The
  // player window takes no keyboard input, so only the map view listens.
  const showing = rolls.some((roll) => !roll.leaving) || toasts.some((toast) => toast.phase !== 'exiting');
  useEffect(() => {
    if (container || !showing) return;
    const win = view?.containerEl.win ?? window;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !canRunMapHotkeys(e, view?.viewId)) return;
      e.preventDefault();
      e.stopPropagation();
      setRolls(closeAllRolls);
      dismissAllToasts();
    };
    win.addEventListener('keydown', handler, true);
    return (): void => win.removeEventListener('keydown', handler, true);
  }, [container, showing, view, dismissAllToasts]);

  const close = useCallback((id: string): void => setRolls((prev) => closeRoll(prev, id)), []);
  const dismiss = useCallback((id: string): void => setRolls((prev) => dismissRoll(prev, id)), []);

  if (toasts.length === 0 && rolls.length === 0) return null;

  const content = (
    // Carries the plugin class itself: in the player window no ancestor does.
    <div className={cn('atlas-dice-rolls atlas-vtt-plugin', diceFontClass(look))}>
      {toasts.length > 0 && (
        // Knotwork defined once; every toast corner draws it with <use>.
        <svg className="atlas-dice-rolls__defs" aria-hidden="true">
          <defs>
            <g id={DICE_TOAST_KNOT_SYMBOL_ID} fill="none" stroke="currentColor" strokeWidth="10">
              {DICE_TOAST_KNOT_PATHS.map((d, i) => <path key={i} d={d} />)}
            </g>
          </defs>
        </svg>
      )}
      <DiceRollStack rolls={rolls} muted={muted} onClose={close} onDone={dismiss} />
      {toasts.map((toast) => (
        <DiceToast key={toast.id} result={toast.result} phase={toast.phase} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
  return container ? createPortal(content, container) : content;
}
