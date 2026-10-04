import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { isModHeld } from '../../../keyboard/modKey';
import type { EntriesBlock, FieldValue, TemplateField } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import { entryName, entryText } from '../../values/entryValues';
import { usePartDraft } from './entryDraft';
import { typingCaret } from './entryFocus';
import {
  entryList, entryPartPatches, entryWithPart, insertEntryPatch, moveEntryToPatch, newEntry, removeEntryPatch, shownEntryIndexes,
} from './entryPatches';
import { singular } from './entryNoun';
import { focusStaysIn } from './focusWithin';
import { usePaneEdit } from './paneEditContext';
import { caretIn, insertAtCaret, placeCaret, textOf } from './plainEditable';

/** The ability edited, or a new one written after `afterIndex` in the stored list (null: first). */
export type EntryEditing =
  | { kind: 'edit'; item: FieldValue; index: number; shown: number; itemKey: string }
  | { kind: 'new'; afterIndex: number | null; shown: number };

export interface EntryInlineEditorProps {
  block: EntriesBlock;
  field: TemplateField;
  editing: EntryEditing;
}

const ENDS_IN_PUNCTUATION = /[.!?:;]$/;

/**
 * One ability typed in place (spec §6.3): its name, run in and bold italic
 * as the card writes it, then its text in the card's own line, so the list
 * around it stays drawn and the card keeps its look. Enter in the name goes
 * to the text; Enter in the text (or Mod+Enter) writes the ability and starts
 * the next; Shift+Enter breaks the line; Backspace in an empty ability deletes
 * it; Alt+↑/↓ move it and Mod+D duplicates it, each one write to the note
 * that takes the text being typed along.
 */
export function EntryInlineEditor({ block, field, editing }: EntryInlineEditorProps): React.JSX.Element {
  const pane = usePaneEdit();
  const target = pane.editing;
  const shape = field.entry;
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const item = editing.kind === 'edit' ? editing.item : null;
  const startName = item === null ? '' : entryName(item, shape) ?? '';
  const startText = item === null ? '' : entryText(item, shape) ?? '';
  const nameDraft = usePartDraft(startName, item ?? {});
  const [textStarted] = useState(startText);
  // What the text holds as typed, kept also once the span has gone (the editor closing for another reason writes it).
  const textNow = useRef(startText);
  const textTyped = (): string => (textRef.current?.isConnected ? textOf(textRef.current) : textNow.current);
  const finished = useRef(false);
  const noun = singular(field.label) || 'Entry';
  const nameStyle = block.nameStyle ?? 'run-in';

  const list = (): FieldValue[] => entryList(pane.read(field).value);
  const listKey = (): string => pane.read(field).key;
  const write = (patches: ReadonlyArray<NotePatch | null>): void => {
    void pane.write(field, patches.filter((patch): patch is NotePatch => patch !== null));
  };

  /** What was last written from here (a move took the text along): later commits are based on it. */
  const written = useRef<{ item: FieldValue; name: string; text: string } | null>(null);

  /** What the ability will read once what is typed is written; and the patches that write it. */
  const typed = (): { after: FieldValue; patches: NotePatch[] } => {
    const name = nameDraft.value;
    const text = textTyped();
    if (editing.kind === 'new') return { after: newEntry(shape, name, text), patches: [] };
    const base = written.current ?? { item: editing.item, name: startName, text: startText };
    const named = entryWithPart(base.item, shape, 'name', name);
    const after = entryWithPart(named, shape, 'text', text);
    if (name === base.name && text === base.text) return { after: base.item, patches: [] };
    const patches = [
      ...entryPartPatches(listKey(), editing.index, base.item, shape, 'name', name),
      ...entryPartPatches(listKey(), editing.index, named, shape, 'text', text),
    ];
    return { after, patches };
  };

  /** Writes what is typed, once; a new ability left blank is dropped. Returns the ability as it will read. */
  const commit = (): FieldValue | null => {
    if (finished.current) return null;
    finished.current = true;
    nameDraft.end();
    const { after, patches } = typed();
    if (editing.kind === 'new') {
      const name = entryName(after, shape);
      const text = entryText(after, shape);
      if (!name && !text) return null;
      write([insertEntryPatch(listKey(), list(), editing.afterIndex, after)]);
      return after;
    }
    write(patches);
    return after;
  };

  // Focus as asked, once, as the editor opens on this ability: the part, and where the caret stood.
  const opening = useRef({ part: target?.part ?? 'name', caret: target?.caret });
  useLayoutEffect(() => {
    const { part, caret } = opening.current;
    if (part === 'text' && textRef.current) {
      textRef.current.focus();
      placeCaret(textRef.current, caret?.[0] ?? textOf(textRef.current).length);
    } else if (nameRef.current) {
      nameRef.current.focus();
      const at = caret ?? [nameRef.current.value.length, nameRef.current.value.length];
      nameRef.current.setSelectionRange(at[0], at[1]);
    }
  }, []);

  // Typed by its value from now on, not its place: a move made meanwhile (another writer, a drag) takes the editor along.
  const anchoring = useRef({ editing, target, pane });
  useEffect(() => {
    const { editing: opened, target: asked, pane: owner } = anchoring.current;
    if (opened.kind === 'edit' && asked && asked.anchor === undefined) owner.start({ ...asked, anchor: opened.item });
  }, []);

  // Moved in the list while typed: the browser may drop focus as the line moves; it comes back where it was.
  const shownAt = editing.kind === 'edit' ? editing.shown : -1;
  const lastFocus = useRef<{ part: 'name' | 'text'; caret: readonly [number, number] | undefined } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const last = lastFocus.current;
    if (!root || !last || root.contains(root.doc.activeElement)) return;
    if (last.part === 'text' && textRef.current) {
      textRef.current.focus();
      placeCaret(textRef.current, last.caret?.[0] ?? textOf(textRef.current).length);
    } else {
      nameRef.current?.focus();
      if (last.caret) nameRef.current?.setSelectionRange(last.caret[0], last.caret[1]);
    }
  }, [shownAt]);

  // A drag's drop while this ability is typed (§7.2): one write with the text and the move, then the same part and caret again.
  const moveRef = useRef<(from: number, to: number) => void>(() => undefined);
  moveRef.current = (from, to) => {
    if (editing.kind !== 'edit') {
      write([moveEntryToPatch(listKey(), list(), from, to)]);
      return;
    }
    const active = rootRef.current?.doc.activeElement ?? null;
    const part = active === textRef.current ? 'text' : 'name';
    const caret = part === 'text' && textRef.current ? caretIn(textRef.current) : typingCaret(active);
    const { after, patches } = typed();
    const order = list().map((value, at): FieldValue => (at === editing.index ? after : value));
    lastFocus.current = { part, caret };
    written.current = { item: after, name: nameDraft.value, text: textTyped() };
    write([...patches, moveEntryToPatch(listKey(), order, from, to)]);
    pane.start({ blockId: block.id, field: field.key, anchor: after, part, caret });
  };
  useEffect(() => pane.registerMover(field.key, (from, to) => moveRef.current(from, to)), [pane, field.key]);

  const nextAfter = (done: FieldValue | null): void => {
    const shown = editing.kind === 'edit' ? editing.shown : Math.max(0, editing.shown - 1);
    if (done === null) pane.stop(true);
    else pane.start({ blockId: block.id, field: field.key, add: true, anchor: done, entry: shown });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const inText = event.target === textRef.current;
    const step = event.altKey && editing.kind === 'edit' ? (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0) : 0;
    if (event.key === 'Escape') {
      if (handledByAnotherControl(event.nativeEvent)) return;
      event.preventDefault();
      finished.current = true;
      pane.stop(true);
    } else if (step !== 0 && editing.kind === 'edit') {
      event.preventDefault();
      const to = Math.min(Math.max(editing.index + step, 0), list().length - 1);
      moveRef.current(editing.index, to);
    } else if (event.key.toLowerCase() === 'd' && isModHeld(event) && editing.kind === 'edit') {
      event.preventDefault();
      // The text typed goes along in the same write; typing goes on in this ability.
      const { after, patches } = typed();
      written.current = { item: after, name: nameDraft.value, text: textTyped() };
      write([insertEntryPatch(listKey(), list(), editing.index, after), ...patches]);
      pane.start({ blockId: block.id, field: field.key, anchor: after, part: inText ? 'text' : 'name' });
    } else if (event.key === 'Enter' && !inText && !isModHeld(event)) {
      event.preventDefault();
      if (textRef.current) {
        textRef.current.focus();
        placeCaret(textRef.current, textOf(textRef.current).length);
      }
    } else if (event.key === 'Enter' && (isModHeld(event) || (inText && !event.shiftKey))) {
      event.preventDefault();
      nextAfter(commit());
    } else if (event.key === 'Enter' && inText && event.shiftKey) {
      event.preventDefault();
      if (textRef.current) insertAtCaret(textRef.current, '\n');
    } else if (event.key === 'Tab' && (inText ? !event.shiftKey : event.shiftKey)) {
      event.preventDefault();
      commit();
      pane.move(field.key, event.shiftKey ? -1 : 1);
    } else if (event.key === 'Backspace' && !nameDraft.value && !textTyped()) {
      event.preventDefault();
      finished.current = true;
      if (editing.kind === 'edit') write([removeEntryPatch(listKey(), editing.item)]);
      const before = editing.shown - 1;
      const stored = shownEntryIndexes(list(), shape)[before];
      const previous = stored === undefined ? undefined : list()[stored];
      if (previous === undefined) pane.stop(true);
      else pane.start({ blockId: block.id, field: field.key, anchor: previous, part: 'text' });
    }
  };

  const onBlur = (event: React.FocusEvent): void => {
    if (focusStaysIn(rootRef.current, event.relatedTarget)) return;
    commit();
    pane.leave(block.id);
  };

  // Text typed here when the editor goes for another reason (the note changed, the pane closed) is written first.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => { commitRef.current(); }, []);

  const name = nameDraft.value;
  const punctuation = nameStyle === 'run-in' && name.trim() && !ENDS_IN_PUNCTUATION.test(name.trim()) ? '.' : '';
  return (
    <div
      ref={rootRef}
      className={`atlas-sb-trait atlas-sb-trait--${nameStyle} atlas-sb-pane-entry-editor${editing.kind === 'new' ? ' atlas-sb-pane-entry-editor--new' : ''}`}
      data-item-key={editing.kind === 'edit' ? editing.itemKey : undefined}
      data-item-index={editing.kind === 'edit' ? editing.index : undefined}
      role="group"
      aria-label={editing.kind === 'edit' ? `Edit ${startName || noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <span className="atlas-sb-trait-name">
        <input
          ref={nameRef}
          type="text"
          className="atlas-sb-pane-input atlas-sb-pane-entry__name"
          data-entry-part="name"
          value={name}
          placeholder={`${noun} name`}
          aria-label={`${noun} name`}
          spellCheck
          onFocus={nameDraft.focus}
          onChange={(event) => nameDraft.change(event.target.value)}
        />
        {punctuation}
      </span>
      <span
        ref={(element) => {
          if (element && textRef.current !== element && element.textContent === '') element.textContent = textStarted;
          textRef.current = element;
        }}
        className="atlas-sb-pane-entry__text"
        data-entry-part="text"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`${noun} description`}
        data-placeholder="What it does"
        tabIndex={0}
        onInput={(event) => { textNow.current = textOf(event.currentTarget); }}
      />
    </div>
  );
}
