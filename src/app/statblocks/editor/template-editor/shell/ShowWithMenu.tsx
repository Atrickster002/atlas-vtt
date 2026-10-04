import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye } from 'lucide-react';
import { STANDING_LIST, handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { useKeepInView } from '../../../../packages/components/primitives/useKeepInView';
import { cn } from '../../../../../utils/cn';
import { noteName } from '../../../../utils/pathUtils';
import { SHOW_EMPTY, SHOW_SAMPLE, sameShowWith, type ShowWith } from './showWith';

/** With more statblocks than this the list gets a search field. */
const SEARCH_FROM = 8;
/** The list shows this many statblocks; typing finds the others. */
const SHOWN = 50;

export interface ShowWithMenuProps {
  /** The statblocks that use the template, the one changed last first. */
  notes: readonly string[];
  value: ShowWith;
  onChange: (choice: ShowWith) => void;
  /** An icon button whose value is in its tooltip, where the capsule has no room for words. */
  compact: boolean;
  /** Offered where no statblock uses the template yet. */
  onNewStatblock?: (() => void) | undefined;
}

function labelOf(choice: ShowWith): string {
  if (choice.kind === 'note') return noteName(choice.path);
  return choice.kind === 'empty' ? 'Empty' : 'Sample';
}

/**
 * "Show with ▾" in the template editor's capsule (§2.3): Sample, Empty (what
 * a new statblock shows), then the statblocks that use the template, the one
 * changed last first, found by typing once there are many.
 */
export function ShowWithMenu({ notes, value, onChange, compact, onNewStatblock }: ShowWithMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const keepInView = useKeepInView(popoverRef, open, 'bottom');
  const searching = notes.length > SEARCH_FROM;
  const choices = useMemo((): ShowWith[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = notes.filter((path) => words.every((word) => noteName(path).toLowerCase().includes(word)));
    const statblocks = found.slice(0, SHOWN).map((path): ShowWith => ({ kind: 'note', path }));
    return [...(words.length ? [] : [SHOW_SAMPLE, SHOW_EMPTY]), ...statblocks];
  }, [notes, query]);

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (open) popoverRef.current?.querySelector<HTMLElement>('input, [role="option"]')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const doc = rootRef.current?.doc;
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) setOpen(false);
    };
    doc?.addEventListener('pointerdown', onPointerDown, true);
    return () => doc?.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };
  const choose = (choice: ShowWith | undefined): void => {
    if (choice) onChange(choice);
    close();
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const count = choices.length;
    if (event.key === 'ArrowDown' && count) setActive((index) => (index + 1) % count);
    else if (event.key === 'ArrowUp' && count) setActive((index) => (index - 1 + count) % count);
    else if (event.key === 'Enter' && count) choose(choices[Math.min(active, count - 1)]);
    else if (event.key === 'Escape' && !handledByAnotherControl(event.nativeEvent)) close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const label = `Show with: ${labelOf(value)}`;
  const trigger = (
    <Button
      ref={triggerRef}
      type="button"
      variant="ghost"
      size="sm"
      className={cn('atlas-sb-pane-menu-button', 'atlas-te-show-with', compact && 'atlas-te-show-with--icon')}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((was) => !was)}
    >
      {compact ? <Eye aria-hidden="true" /> : <span className="atlas-sb-pane-menu-button__text">{label}</span>}
      {!compact && <ChevronDown aria-hidden="true" className="atlas-sb-pane-menu-button__chevron" />}
    </Button>
  );

  return (
    <div ref={rootRef} className="atlas-te-show-with-root">
      {compact ? <LabelTooltip label={label}>{trigger}</LabelTooltip> : trigger}
      {open && (
        <div
          ref={popoverRef}
          className={cn('atlas-te-show-with__popover', keepInView.capped && 'atlas-keep-in-view--capped')}
          style={keepInView.style}
          role="dialog"
          aria-label="Show with"
          onKeyDown={onKeyDown}
        >
          {searching && (
            <input
              type="text"
              className="atlas-te-insert__search"
              placeholder="Find a statblock"
              aria-label="Find a statblock"
              aria-controls={listId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <div id={listId} role="listbox" aria-label="Show with" className="atlas-te-show-with__list" {...STANDING_LIST}>
            {choices.map((choice, index) => (
              <div
                key={choice.kind === 'note' ? choice.path : choice.kind}
                role="option"
                tabIndex={searching ? -1 : 0}
                aria-selected={sameShowWith(choice, value)}
                data-highlighted={index === Math.min(active, choices.length - 1) ? '' : undefined}
                data-divided={choice.kind === 'note' && index > 0 && choices[index - 1]?.kind !== 'note' ? '' : undefined}
                className="atlas-ctx-item"
                onPointerMove={() => setActive(index)}
                onClick={() => choose(choice)}
              >
                {choice.kind === 'empty' ? 'Empty (what a new statblock shows)' : labelOf(choice)}
              </div>
            ))}
            {choices.length === 0 && <div className="atlas-te-insert__empty">No statblock matches</div>}
          </div>
          {notes.length === 0 && (
            <div className="atlas-te-show-with__none">
              <span>No statblock uses this template yet.</span>
              {onNewStatblock && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { close(); onNewStatblock(); }}>
                  New statblock with this template
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
