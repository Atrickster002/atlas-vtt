import React, { useEffect, useRef, useState } from 'react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

export interface TemplateNameFieldProps {
  name: string;
  /** Built-ins and templates of a newer Atlas keep their name. */
  editable: boolean;
  /** Renames the file; resolves with why it could not, or null. */
  onRename: (name: string) => Promise<string | null>;
}

/**
 * The template's name in the header (§7.4), edited in place: a click or Enter
 * opens it, Enter or leaving renames the file, Escape keeps the old name. A
 * name the vault refuses stays in the field with the reason beside it.
 */
export function TemplateNameField({ name, editable, onRename }: TemplateNameFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refocus = useRef(false);
  const editing = draft !== null;
  // Opening selects the whole name, so typing replaces it; closing with a key gives focus back to the name.
  useEffect(() => {
    if (editing) inputRef.current?.select();
    else if (refocus.current) buttonRef.current?.focus();
    refocus.current = false;
  }, [editing]);

  const stop = (focusName: boolean): void => {
    refocus.current = focusName;
    setDraft(null);
    setProblem(null);
  };

  const commit = async (focusName: boolean): Promise<void> => {
    const next = draft?.trim() ?? '';
    if (busy || draft === null) return;
    if (!next || next === name) {
      stop(focusName);
      return;
    }
    setBusy(true);
    const failed = await onRename(next);
    setBusy(false);
    if (failed) setProblem(failed);
    else stop(focusName);
  };

  if (!editable) return <span className="atlas-te-name atlas-te-name--fixed">{name}</span>;

  if (draft === null) {
    return (
      <LabelTooltip label="Rename template" describe>
        <button ref={buttonRef} type="button" className="atlas-te-name" onClick={() => setDraft(name)}>
          {name}
        </button>
      </LabelTooltip>
    );
  }

  return (
    <span className="atlas-te-name-edit">
      <input
        ref={inputRef}
        type="text"
        className="atlas-te-name-input"
        aria-label="Template name"
        aria-invalid={problem ? true : undefined}
        value={draft}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => { setDraft(event.target.value); setProblem(null); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') void commit(true);
          else if (event.key === 'Escape') stop(true);
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onBlur={() => { void commit(false); }}
      />
      {problem && <span className="atlas-te-name-problem" role="alert">{problem}</span>}
    </span>
  );
}
