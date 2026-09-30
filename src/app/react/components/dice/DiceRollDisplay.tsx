import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { throwStyle } from '../../../dice3d/diceDisplay';
import { diceSceneToShow } from '../../../dice3d/rollPresentation';
import { warmDiceSounds } from '../../../dice3d/audio/diceSamples';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { DiceRollStack } from '../dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../dice3d/rollStackState';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { DiceToast } from './DiceToast';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';
import { useDiceToasts } from './useDiceToasts';

interface DiceRollDisplayProps {
  /** Element the rolls render into, e.g. in the player window. Defaults to where the component is mounted. */
  container?: HTMLElement;
  /** Adapts each roll before it is shown, e.g. to leave out who rolled it. */
  prepare?: (result: DiceRollResult) => DiceRollResult;
  /** Throws without sound, where another window already plays it. */
  muted?: boolean;
}

/**
 * Every dice roll, at the top centre of the map: thrown as 3D dice, or as a
 * result card when 3D dice are off or the roll holds dice no real body shows.
 */
export function DiceRollDisplay({ container, prepare, muted = false }: DiceRollDisplayProps): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const display = useDiceDisplay(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);

  useEffect(() => {
    const handler = (e: Event): void => {
      const raw = (e as CustomEvent<DiceRollResult>).detail;
      const result = prepare ? prepare(raw) : raw;
      const scene = diceSceneToShow(result, display);
      if (!scene) {
        addToast(result);
        return;
      }
      if (!muted) warmDiceSounds();
      setRolls((prev) => pushRoll(prev, { result, scene, style: throwStyle(display) }));
    };
    document.addEventListener('atlas-dice-rolled', handler);
    return (): void => document.removeEventListener('atlas-dice-rolled', handler);
  }, [addToast, prepare, display, muted]);

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
    <div className="atlas-dice-rolls atlas-vtt-plugin">
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
