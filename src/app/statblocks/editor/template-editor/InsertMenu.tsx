import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { App } from 'obsidian';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { cn } from '../../../../utils/cn';
import { sampleRecord } from '../../model/sampleValues';
import { StatblockSheet } from '../../render/StatblockSheet';
import type { Box } from './gapGeometry';
import { bestMatch, findItems, groupItems, insertItems, itemKey, previewTemplate, type InsertItem } from './insertItems';
import type { ChromeStyle } from './LabelEditor';

export interface InsertMenuProps {
  /** The layer the menu is drawn in, and where it hangs from in that layer's coordinates. */
  layer: HTMLElement;
  anchor: Box;
  app?: App | undefined;
  onInsert: (item: InsertItem) => void;
  /** Escape, or a press outside: the opener takes focus back. */
  onClose: () => void;
}

const ALL_ITEMS = insertItems();

/** One row's preview: the item drawn by the real renderer with neutral samples. */
function Preview({ item, app }: { item: InsertItem; app: App | undefined }): React.JSX.Element {
  const template = useMemo(() => previewTemplate(item), [item]);
  const record = useMemo(() => sampleRecord(template), [template]);
  return (
    <div className="atlas-te-insert__preview" aria-hidden="true">
      <StatblockSheet template={template} name={item.label} fields={record} variant="feed" mode="editing" app={app} />
    </div>
  );
}

interface InsertListProps {
  id: string;
  groups: ReturnType<typeof groupItems>;
  current: InsertItem | undefined;
  onHover: (item: InsertItem) => void;
  onChoose: (item: InsertItem) => void;
}

/** The items under their group labels; the highlighted row has the context menu's hover look. */
function InsertList({ id, groups, current, onHover, onChoose }: InsertListProps): React.JSX.Element {
  return (
    <div id={id} className="atlas-te-insert__list" role="listbox" aria-label="Blocks" {...STANDING_LIST}>
      {groups.length === 0 && <div className="atlas-te-insert__empty">No block matches</div>}
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.label} className="atlas-te-insert__group">
          <div className="atlas-te-insert__group-label" aria-hidden="true">{group.label}</div>
          {group.items.map((item) => (
            <div
              key={itemKey(item)}
              id={`${id}-${itemKey(item)}`}
              data-item={itemKey(item)}
              role="option"
              aria-selected={item === current}
              data-highlighted={item === current ? '' : undefined}
              className="atlas-ctx-item atlas-te-insert__item"
              onPointerMove={() => onHover(item)}
              // The search keeps focus, so the keys go on working after a click.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onChoose(item)}
            >
              {item.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The insert menu (§7.6), opened by `/` or the `+` line: "Find a block",
 * then the primitives by group, with a preview of the row under the pointer
 * or the keys. Enter inserts, Escape closes.
 */
export function InsertMenu({ layer, anchor, app, onInsert, onClose }: InsertMenuProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const variants = useAnchoredPopoverVariants();
  const keepInView = useKeepInView(ref, true, above ? 'top' : 'bottom', `${anchor.left},${anchor.top}`);
  const found = useMemo(() => findItems(ALL_ITEMS, query), [query]);
  const groups = useMemo(() => groupItems(found), [found]);
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = ordered[Math.min(active, ordered.length - 1)];

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => setActive(bestMatch(ordered, query)), [ordered, query]);

  // Opens upward where the layer has no room below the anchor.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    setAbove(anchor.bottom + menu.offsetHeight + 8 > layer.clientHeight && anchor.top > layer.clientHeight / 2);
  }, [anchor, layer]);

  useEffect(() => {
    const doc = layer.doc;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !event.composedPath().includes(ref.current)) onClose();
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [layer, onClose]);

  useEffect(() => {
    if (current) ref.current?.querySelector(`[data-item="${itemKey(current)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const count = ordered.length;
    if (event.key === 'ArrowDown' && count) setActive((index) => (index + 1) % count);
    else if (event.key === 'ArrowUp' && count) setActive((index) => (index - 1 + count) % count);
    else if (event.key === 'Enter' && current) onInsert(current);
    else if (event.key === 'Escape') onClose();
    else if (event.key === 'Tab') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const style: React.CSSProperties & ChromeStyle = {
    ...keepInView.style,
    '--atlas-te-insert-x': `${anchor.left}px`,
    '--atlas-te-insert-y': `${above ? anchor.top : anchor.bottom}px`,
  };

  return createPortal(
    <div
      ref={ref}
      className={cn('atlas-te-insert', keepInView.capped && 'atlas-keep-in-view--capped')}
      data-above={above || undefined}
      style={style}
      role="dialog"
      aria-label="Add a block"
    >
      <motion.div className="atlas-te-insert__panel" variants={variants} initial="hidden" animate="visible" exit="exit">
        <div className="atlas-te-insert__menu">
          <input
            ref={inputRef}
            type="text"
            className="atlas-te-insert__search"
            placeholder="Find a block"
            aria-label="Find a block"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current ? `${listId}-${itemKey(current)}` : undefined}
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <InsertList
            id={listId}
            groups={groups}
            current={current}
            onHover={(item) => setActive(ordered.indexOf(item))}
            onChoose={onInsert}
          />
        </div>
        {current && <Preview item={current} app={app} />}
      </motion.div>
    </div>,
    layer,
  );
}
