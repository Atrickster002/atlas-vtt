import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { cn } from '../../../../utils/cn';
import { CHROME_ATTRIBUTE } from '../interaction/chrome';
import { reachOf } from './paneBlockActions';
import { usePaneEdit } from './paneEditContext';
import { sectionGroups, type SectionChoice } from './sectionChoices';
import { addHeaderText } from './templateReach';
import './add-section.scss';

interface SectionListProps {
  after: string | null;
  onDone: () => void;
}

/** The menu's body: the reach in its header, the search, then the sections by group. Arrows move, Enter adds, Escape closes. */
function SectionList({ after, onDone }: SectionListProps): React.JSX.Element {
  const pane = usePaneEdit();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const template = pane.template;
  const groups = useMemo(() => (template ? sectionGroups(template, pane.record, pane.folded, query) : []), [template, pane.record, pane.folded, query]);
  const ordered = groups.flatMap((group) => group.choices);
  const current = ordered[Math.min(active, ordered.length - 1)];
  const entry = pane.entry;
  const header = entry ? addHeaderText(reachOf(pane.app, entry, pane.collectionId)) : null;

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  const choose = (choice: SectionChoice): void => {
    onDone();
    void pane.addSection(choice, after);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const count = ordered.length;
    if (event.key === 'ArrowDown' && count) setActive((index) => (index + 1) % count);
    else if (event.key === 'ArrowUp' && count) setActive((index) => (index - 1 + count) % count);
    else if (event.key === 'Enter' && current) choose(current);
    else if (event.key === 'Escape') onDone();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="atlas-sb-add-section__picker">
      {header && <p className="atlas-sb-add-section__reach">{header}</p>}
      <input
        type="text"
        className="atlas-sb-add-section__search"
        placeholder="Find a section, or name a new one"
        aria-label="Find a section"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
        spellCheck={false}
        autoComplete="off"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div ref={listRef} id={listId} className="atlas-sb-add-section__list" role="listbox" aria-label="Sections" {...STANDING_LIST}>
        {groups.length === 0 && <div className="atlas-sb-add-section__empty">Type a name for a new section</div>}
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={group.label} className="atlas-sb-add-section__group">
            <div className="atlas-sb-add-section__group-label" aria-hidden="true">{group.label}</div>
            {group.choices.map((choice) => (
              <div
                key={choice.id}
                id={`${listId}-${choice.id}`}
                data-index={ordered.indexOf(choice)}
                role="option"
                aria-selected={choice === current}
                data-highlighted={choice === current ? '' : undefined}
                className="atlas-ctx-item atlas-sb-add-section__option"
                onPointerMove={() => setActive(ordered.indexOf(choice))}
                // The search keeps focus, so the keys go on working after a click.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(choice)}
              >
                <span className="atlas-ctx-item__label">{choice.label}</span>
                {choice.detail && <span className="atlas-sb-add-section__detail">{choice.detail}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Add a section…", last in the row under the card (spec §8.3): the same
 * sections whether opened here or from a block's menu ("Add a section
 * below"), the template's folded ones first. Its header names how far the
 * change reaches before anything is chosen.
 */
export function AddSectionMenu(): React.JSX.Element | null {
  const pane = usePaneEdit();
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  const opening = pane.addingSection;
  const open = opening !== null;
  const variants = useAnchoredPopoverVariants();
  const keepInView = useKeepInView(popoverRef, open, above ? 'top' : 'bottom', open ? String(opening.after) : 'closed');

  const close = (): void => {
    pane.openAddSection(null);
    buttonRef.current?.focus({ preventScroll: true });
  };

  // Opens upward where the leaf has no room below the row; brought into view when a block's menu opened it.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!open || !row) return;
    const frame = (row.closest('.workspace-leaf') ?? row.doc.body).getBoundingClientRect();
    const box = row.getBoundingClientRect();
    setAbove(frame.bottom - box.bottom < 320 && box.top - frame.top > frame.bottom - box.bottom);
    row.scrollIntoView({ block: 'nearest' });
  }, [open]);

  useEffect(() => {
    const row = rowRef.current;
    if (!open || !row) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (!event.composedPath().includes(row)) pane.openAddSection(null);
    };
    row.doc.addEventListener('pointerdown', onPointerDown, true);
    return () => row.doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, pane]);

  if (!pane.entry) return null;
  return (
    <div ref={rowRef} className="atlas-sb-add-section">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="sm"
        className="atlas-sb-add-section__button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : pane.openAddSection({ after: null }))}
      >
        <Plus aria-hidden="true" />
        Add a section…
      </Button>
      <AnimatePresence>
        {open && (
          <div
            key="popover"
            ref={popoverRef}
            className={cn('atlas-sb-add-section__popover', keepInView.capped && 'atlas-keep-in-view--capped')}
            data-above={above || undefined}
            style={keepInView.style}
            role="dialog"
            aria-label="Add a section"
            {...{ [CHROME_ATTRIBUTE]: '' }}
          >
            <motion.div className="atlas-sb-add-section__panel" variants={variants} initial="hidden" animate="visible" exit="exit">
              <SectionList after={opening.after} onDone={close} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
