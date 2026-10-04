import { useEffect, useRef, useState } from 'react';
import type { FieldValue } from '../../model/templateTypes';
import type { EntryPart } from './entryPatches';

/** Text typed into a part, and the entry typing started on, which the commit is based on. */
export interface TypedPart {
  text: string;
  from: FieldValue;
}

interface Draft extends TypedPart {
  focused: boolean;
  /** The part's text when typing started. */
  started: string;
}

/**
 * A part's text: the note's while the part is not being typed in, the typed
 * text from focus until the note holds what was committed. What arrives from
 * the note never replaces what is being typed; the commit is based on the
 * entry typing started on, so the note's own change meanwhile (another
 * writer, a reorder) is found by the patcher or reported, never overwritten.
 */
export function usePartDraft(current: string, item: FieldValue): {
  value: string;
  focus: () => void;
  change: (text: string) => void;
  /** Ends typing; returns the text to commit, or null when nothing changed. */
  end: () => TypedPart | null;
} {
  const [draft, setDraftState] = useState<Draft | null>(null);
  // Read synchronously: a part ended by a key is not ended again by the blur or unmount that follows.
  const draftRef = useRef(draft);
  const setDraft = (next: Draft | null): void => {
    draftRef.current = next;
    setDraftState(next);
  };
  useEffect(() => {
    if (draftRef.current && !draftRef.current.focused) {
      draftRef.current = null;
      setDraftState(null);
    }
  }, [current]);
  return {
    value: draft?.text ?? current,
    focus: () => setDraft({ text: current, focused: true, started: current, from: item }),
    change: (text) => {
      const typing = draftRef.current?.focused ? draftRef.current : null;
      setDraft({ text, focused: true, started: typing?.started ?? current, from: typing?.from ?? item });
    },
    end: () => {
      const typed = draftRef.current?.focused ? draftRef.current : null;
      const changed = typed !== null && typed.text !== typed.started;
      setDraft(changed ? { ...typed, focused: false } : null);
      return changed ? { text: typed.text, from: typed.from } : null;
    },
  };
}

/** What a key that ends typing takes along: the part, its text and the entry typing started on. */
export interface PendingPart extends TypedPart {
  part: EntryPart;
}
