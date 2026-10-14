import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChooseFloors, FloorsChoice, FloorsRequest } from '../../../../import/uvtt/runUvttGroupImport';

export interface FloorsChoiceState {
  /** What the dialog asks, while it is open. */
  request: FloorsRequest | null;
  ask: ChooseFloors;
  answer: (choice: FloorsChoice | null) => void;
}

/**
 * The question an import asks about files that can be the floors of one scene, held until the
 * GM answers it in the dialog. A question asked while one is open cancels that one, and closing
 * the asset manager cancels the question it holds: an import never waits on a dialog nobody sees.
 */
export function useFloorsChoice(isOpen: boolean): FloorsChoiceState {
  const [request, setRequest] = useState<FloorsRequest | null>(null);
  const pending = useRef<((choice: FloorsChoice | null) => void) | null>(null);

  const answer = useCallback((choice: FloorsChoice | null): void => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(choice);
  }, []);

  const ask = useCallback<ChooseFloors>((next) => new Promise((resolve) => {
    pending.current?.(null);
    pending.current = resolve;
    setRequest(next);
  }), []);

  useEffect(() => { if (!isOpen) answer(null); }, [isOpen, answer]);
  useEffect(() => () => pending.current?.(null), []);
  return { request, ask, answer };
}
