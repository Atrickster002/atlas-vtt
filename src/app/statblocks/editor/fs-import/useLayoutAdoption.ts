import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { adoptStatblocks } from '../../fs/fsLayoutNotes';
import type { TemplateId } from '../../model/templateTypes';
import type { TemplateSwitchResult } from '../../notes/templateSwitch';

export type AdoptionPhase =
  | { kind: 'ready' }
  | { kind: 'running'; done: number; total: number }
  /** `result` null: the batch failed before it ended, which `problem` says. */
  | { kind: 'finished'; result: TemplateSwitchResult | null; problem: string | null };

export interface LayoutAdoption {
  phase: AdoptionPhase;
  adopt: () => void;
  /** Stops at the next note; the notes not reached keep their layout alone. */
  cancel: () => void;
}

/**
 * The adoption batch (§6.4): `atlas-template` written into each of the notes,
 * one after the other, with progress and Cancel. Unmounting cancels it.
 */
export function useLayoutAdoption(app: App, notes: readonly string[], templateId: TemplateId): LayoutAdoption {
  const [phase, setPhase] = useState<AdoptionPhase>({ kind: 'ready' });
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const latest = useRef({ app, notes, templateId });
  latest.current = { app, notes, templateId };

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  const adopt = useCallback((): void => {
    if (controller.current) return;
    const { app: vault, notes: paths, templateId: id } = latest.current;
    const abort = new AbortController();
    controller.current = abort;
    const show = (next: AdoptionPhase): void => { if (live.current) setPhase(next); };
    show({ kind: 'running', done: 0, total: paths.length });
    adoptStatblocks(vault, paths, id, { signal: abort.signal, onProgress: (done, total) => show({ kind: 'running', done, total }) }).then(
      (result) => show({ kind: 'finished', result, problem: null }),
      (error: unknown) => {
        console.error('[Atlas] Adopting statblocks failed:', error);
        show({ kind: 'finished', result: null, problem: `Couldn't finish: ${error instanceof Error ? error.message : String(error)}` });
      },
    );
  }, []);

  const cancel = useCallback((): void => { controller.current?.abort(); }, []);

  return { phase, adopt, cancel };
}
