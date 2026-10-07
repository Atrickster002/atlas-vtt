import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTemplateEditor } from '../editorContext';

export type InspectorGroupId = 'visibility' | 'write-as' | 'property' | 'themes';

/** More options stay closed until opened (§10.1); each says what it holds while closed. */
const OPEN_AT_FIRST: ReadonlySet<InspectorGroupId> = new Set();

/** Which groups were opened or closed, per app, so every block and every view shows them the same way. */
const remembered = new WeakMap<object, Map<InspectorGroupId, boolean>>();
/** Where there is no app (a test): one memory for all. */
const NO_APP = {};

function memoryOf(owner: object): Map<InspectorGroupId, boolean> {
  let memory = remembered.get(owner);
  if (!memory) {
    memory = new Map();
    remembered.set(owner, memory);
  }
  return memory;
}

interface Reveal {
  id: InspectorGroupId;
  /** The input to focus once the group is open (`data-focus-key`). */
  focusKey: string | undefined;
}

/** Groups shown now, per app, told when another control asks for one of them. */
const revealListeners = new WeakMap<object, Set<(reveal: Reveal) => void>>();
/** A reveal asked for before its group was shown (Settings opening with it): the group takes it as it mounts. */
const pendingReveals = new WeakMap<object, Reveal>();

/**
 * Opens a group of the Settings panel and focuses one of its inputs, from a
 * control outside it (the toolbar's Kind of value). The group stays open as
 * if opened by hand.
 */
export function revealInspectorGroup(app: object | undefined, id: InspectorGroupId, focusKey?: string): void {
  const owner = app ?? NO_APP;
  memoryOf(owner).set(id, true);
  const reveal = { id, focusKey };
  const listeners = revealListeners.get(owner);
  if (listeners && listeners.size > 0) listeners.forEach((listener) => listener(reveal));
  else pendingReveals.set(owner, reveal);
}

/** Opens the group when it is asked for, then brings it into view with its input focused. */
function useReveal(owner: object, id: InspectorGroupId, open: () => void): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);
  const [focusKey, setFocusKey] = useState<{ key: string | undefined } | null>(null);
  useEffect(() => {
    const take = (reveal: Reveal): void => {
      if (reveal.id !== id) return;
      open();
      setFocusKey({ key: reveal.focusKey });
    };
    const pending = pendingReveals.get(owner);
    if (pending?.id === id) {
      pendingReveals.delete(owner);
      take(pending);
    }
    let listeners = revealListeners.get(owner);
    if (!listeners) {
      listeners = new Set();
      revealListeners.set(owner, listeners);
    }
    listeners.add(take);
    return () => { listeners.delete(take); };
  }, [owner, id, open]);
  useEffect(() => {
    if (!focusKey) return;
    const section = ref.current;
    section?.scrollIntoView({ block: 'nearest' });
    const input = focusKey.key ? section?.querySelector<HTMLElement>(`[data-focus-key="${focusKey.key}"]`) : null;
    input?.focus();
  }, [focusKey]);
  return ref;
}

export interface InspectorGroupProps {
  id: InspectorGroupId;
  title: string;
  /** What the group holds, said in plain words while it is closed ("Hides when empty"). */
  summary?: string | undefined;
  children: React.ReactNode;
}

/**
 * One of the Settings panel's More options (§10.3): a header that opens and
 * closes it, with a muted summary of what is set while it is closed, then its
 * settings in two columns. It remembers whether it was open, per device.
 */
export function InspectorGroup({ id, title, summary, children }: InspectorGroupProps): React.JSX.Element {
  const { app } = useTemplateEditor();
  const memory = memoryOf(app ?? NO_APP);
  const [open, setOpen] = useState(() => memory.get(id) ?? OPEN_AT_FIRST.has(id));
  const titleId = useId();
  const show = useCallback(() => setOpen(true), []);
  const ref = useReveal(app ?? NO_APP, id, show);
  const toggle = (): void => {
    memory.set(id, !open);
    setOpen(!open);
  };
  return (
    <section ref={ref} className="atlas-te-group" data-group={id} data-open={open || undefined} aria-labelledby={titleId}>
      <button type="button" className="atlas-te-group__header atlas-te-span" aria-expanded={open} onClick={toggle}>
        <span id={titleId}>{title}</span>
        {!open && summary && <span className="atlas-te-group__summary">{summary}</span>}
        <ChevronRight className="atlas-te-group__chevron" aria-hidden="true" />
      </button>
      {open && children}
    </section>
  );
}
