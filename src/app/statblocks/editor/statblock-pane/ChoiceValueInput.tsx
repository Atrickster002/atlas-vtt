import React, { useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import type { TemplateField } from '../../model/templateTypes';
import { quoted } from '../../values/valueText';
import type { ValueInputProps } from './TextValueInput';
import { useFieldDraft } from './useFieldDraft';

interface ChoiceOption {
  value: string;
  label: string;
}

/** The field's options that start with or contain the typed text, and "Use “Swamp fey”" where any text is allowed. */
export function choiceOptions(field: Pick<TemplateField, 'options' | 'open'>, typed: string): ChoiceOption[] {
  const wanted = typed.trim().toLowerCase();
  const options = (field.options ?? []).filter((option) => option.toLowerCase().includes(wanted));
  const listed = options.map((option) => ({ value: option, label: option }));
  const exact = options.some((option) => option.toLowerCase() === wanted);
  return field.open && wanted && !exact ? [...listed, { value: typed.trim(), label: `Use ${quoted(typed.trim())}` }] : listed;
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * One of a field's options (§7.6): typing filters the list, ↑/↓ move through
 * it, Enter takes the highlighted option, and an open field also takes what
 * was typed. Escape closes the list first, then leaves the field.
 */
export function ChoiceValueInput({ field, autoFocus }: ValueInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { draft, setDraft, commit, onKey, focusProps, pane } = useFieldDraft(field, inputRef, autoFocus);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = open ? choiceOptions(field, draft) : [];
  const keepInView = useKeepInView(listRef, open && options.length > 0, 'bottom');

  const pick = (value: string): void => {
    setDraft(value);
    setOpen(false);
    void commit(value);
    pane.stop(true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const step = STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((index) => Math.min(Math.max(index + step, 0), Math.max(options.length - 1, 0)));
      return;
    }
    if (open && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    const chosen = options[active];
    if (open && event.key === 'Enter' && chosen) {
      event.preventDefault();
      pick(chosen.value);
      return;
    }
    onKey(event);
  };

  return (
    <span className="atlas-sb-pane-field atlas-sb-pane-choice">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        className="atlas-sb-pane-input"
        value={draft}
        placeholder={field.prompt?.trim() || field.label}
        aria-label={field.label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        {...focusProps}
        onBlur={() => {
          setOpen(false);
          focusProps.onBlur();
        }}
      />
      {open && options.length > 0 && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={field.label}
          className={cn('atlas-sb-pane-options', keepInView.capped && 'atlas-keep-in-view--capped')}
          style={keepInView.style}
        >
          {options.map((option, index) => (
            <div
              key={`${option.value}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn('atlas-sb-pane-option', index === active && 'is-active')}
              // Keeps focus in the input, so picking never blurs (and commits) what was typed.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
