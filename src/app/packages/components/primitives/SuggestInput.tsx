import React, { useId, useState } from 'react';
import { cn } from '../../../../utils/cn';

interface SuggestInputProps {
  value: string;
  /** Values offered below the field; any other text may be typed. */
  suggestions: readonly string[];
  onChange: (value: string) => void;
  /** Names the field for screen readers; Obsidian shows no tooltip for it inside Atlas. */
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * A text field with suggestions in the select's list instead of the browser's own
 * (`<datalist>`), which cannot be styled. Typing narrows them; arrow keys move, Enter or a
 * click picks, Escape closes.
 */
export function SuggestInput({ value, suggestions, onChange, ariaLabel, placeholder, invalid = false, className }: SuggestInputProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const typed = value.trim().toLowerCase();
  const matches = suggestions.filter((suggestion) => suggestion.toLowerCase().includes(typed));
  // Nothing left to suggest once the field holds the only match
  const shown = isOpen && matches.length > 0 && !(matches.length === 1 && matches[0]!.toLowerCase() === typed);
  const optionId = (index: number): string => `${listId}-${index}`;

  const close = (): void => {
    setIsOpen(false);
    setActive(-1);
  };

  const pick = (suggestion: string): void => {
    onChange(suggestion);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (!shown) setIsOpen(true);
      else setActive((index) => Math.min(matches.length - 1, Math.max(0, index + step)));
    } else if (shown && event.key === 'Enter' && matches[active] !== undefined) {
      event.preventDefault();
      pick(matches[active]);
    } else if (shown && event.key === 'Escape') {
      // The list closes; the dialog around the field stays open
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className={cn('atlas-suggest-input', shown && 'atlas-open')}>
      <input
        type="text"
        role="combobox"
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
        spellCheck={false}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActive(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {shown && (
        // A press on the list must not take the focus from the field, which would close the list before the click
        <div id={listId} role="listbox" aria-label={ariaLabel} className="atlas-select-content" onMouseDown={(event) => event.preventDefault()}>
          {matches.map((suggestion, index) => (
            <div key={suggestion} id={optionId(index)} role="option" aria-selected={index === active}
              className={cn('atlas-select-option', index === active && 'atlas-active')}
              onMouseEnter={() => setActive(index)} onClick={() => pick(suggestion)}>
              <span className="atlas-select-option-text">{suggestion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
