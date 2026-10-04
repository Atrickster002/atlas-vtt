import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { useTemplateEditor } from './editorContext';
import { bestMatch, findItems, groupItems, insertItems, itemKey, type InsertItem } from './insertItems';
import { ItemPreview, PaletteRow } from './PaletteRow';

const ALL_ITEMS = insertItems();

/** Where the preview of the row under the pointer or the keys stands: beside the panel, level with the row. */
interface Shown {
  item: InsertItem;
  left: number;
  top: number;
}

type PreviewStyle = React.CSSProperties & Record<`--${string}`, string>;

/**
 * The Add panel (spec §10.7): "Find a block", then the primitives statblocks
 * are made of, each once, by group, each a row with its plain name and one
 * line saying what it makes. The row under the pointer or the keys shows its
 * preview beside the panel, drawn as the card draws it. A click or Enter
 * inserts below the selection; a drag inserts where the line shows. When
 * nothing matches, a value of the typed name is offered.
 */
export function BlocksPalette(): React.JSX.Element {
  const { insert, insertNamedStat } = useTemplateEditor();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const searching = query.trim() !== '';
  const items = useMemo(() => (searching ? findItems(ALL_ITEMS, query) : ALL_ITEMS), [searching, query]);
  const groups = useMemo(() => (searching ? [{ id: 'found', label: 'Found', items }] : groupItems(ALL_ITEMS)), [searching, items]);
  const current = items[Math.min(active, items.length - 1)];
  const layer = rootRef.current?.closest('.atlas-te')?.querySelector<HTMLElement>('.atlas-te-layer') ?? null;

  // Rows are drawn once: they hold one callback that always inserts through the editor as it is now.
  const latestInsert = useRef(insert);
  latestInsert.current = insert;
  const choose = useCallback((item: InsertItem): void => {
    setQuery('');
    setShown(null);
    latestInsert.current(item);
  }, []);

  const preview = useCallback((item: InsertItem, row: HTMLElement): void => {
    const panel = row.closest('.atlas-te-floating') ?? row;
    const host = row.closest('.atlas-te')?.querySelector('.atlas-te-layer');
    if (!host) return;
    const origin = host.getBoundingClientRect();
    setShown({ item, left: panel.getBoundingClientRect().right - origin.left, top: row.getBoundingClientRect().top - origin.top });
  }, []);

  const focusRow = (index: number): void => {
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('.atlas-te-palette__row');
    rows?.[index]?.focus();
    rows?.[index]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const count = items.length;
    const inSearch = event.target === event.currentTarget.querySelector('input');
    let next: number | null = null;
    if (event.key === 'ArrowDown' && count) next = (active + 1) % count;
    else if (event.key === 'ArrowUp' && count) next = (active - 1 + count) % count;
    else if (event.key === 'Enter' && inSearch && current) choose(current);
    else if (event.key === 'Escape' && query) setQuery('');
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (next === null) return;
    setActive(next);
    if (!inSearch) focusRow(next);
  };

  const previewStyle: PreviewStyle | undefined = shown ? { '--atlas-te-preview-x': `${shown.left}px`, '--atlas-te-preview-y': `${shown.top}px` } : undefined;

  return (
    <div ref={rootRef} className="atlas-te-palette" onKeyDown={onKeyDown} onPointerLeave={() => setShown(null)}>
      <input
        type="search"
        className="atlas-te-input atlas-te-palette__search"
        placeholder="Find a block"
        aria-label="Find a block"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={current ? `${listId}-${itemKey(current)}` : undefined}
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(bestMatch(findItems(ALL_ITEMS, event.target.value), event.target.value));
        }}
      />
      <div id={listId} className="atlas-te-palette__groups" role="listbox" aria-label="Blocks" {...STANDING_LIST}>
        {items.length === 0 && (
          <div className="atlas-te-palette__empty">
            Nothing called “{query.trim()}”.{' '}
            <button type="button" className="atlas-te-palette__make" onClick={() => { insertNamedStat(query); setQuery(''); }}>
              Make a value called “{query.trim()}”
            </button>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={group.label} className="atlas-te-palette__group">
            {!searching && <div className="atlas-te-palette__group-label" aria-hidden="true">{group.label}</div>}
            {group.items.map((item) => {
              const index = items.indexOf(item);
              return (
                <PaletteRow key={itemKey(item)} item={item} index={index} tabStop={index === Math.min(active, items.length - 1)}
                  active={item === current && searching} onInsert={choose} onFocusIndex={setActive} onPreview={preview} />
              );
            })}
          </div>
        ))}
      </div>
      {shown && layer && createPortal(
        <div className="atlas-te-palette__preview" style={previewStyle} role="presentation">
          <ItemPreview item={shown.item} />
        </div>,
        layer,
      )}
    </div>
  );
}
