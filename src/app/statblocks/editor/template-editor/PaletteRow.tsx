import React, { memo, useMemo } from 'react';
import { sampleRecord } from '../../model/sampleValues';
import { StatblockSheet } from '../../render/StatblockSheet';
import { usePaletteDrag } from '../dnd/useDragSources';
import { blockGlyph } from './editorGlyphs';
import { itemKey, previewTemplate, type InsertItem } from './insertItems';

/** An item drawn by the real renderer with samples, at a card's width: the hover preview and what a drag carries. */
export function ItemPreview({ item }: { item: InsertItem }): React.JSX.Element {
  const template = useMemo(() => previewTemplate(item), [item]);
  const record = useMemo(() => sampleRecord(template), [template]);
  return (
    <div className="atlas-te-item-preview" aria-hidden="true" inert>
      <StatblockSheet template={template} name={item.label} fields={record} variant="feed" mode="editing" />
    </div>
  );
}

export interface PaletteRowProps {
  item: InsertItem;
  /** Its place among all rows, which the arrows move by. */
  index: number;
  /** The one row Tab stops on; arrows move between the others. */
  tabStop: boolean;
  /** The row the keys or the pointer are on: its preview shows beside the panel. */
  active: boolean;
  onInsert: (item: InsertItem) => void;
  onFocusIndex: (index: number) => void;
  /** The pointer came onto the row, or focus did: show its preview. */
  onPreview: (item: InsertItem, row: HTMLElement) => void;
}

/**
 * One row of the Add panel (spec §10.7): the item's glyph, its plain name and
 * one line saying what it makes. A click inserts it below the selection;
 * dragged onto the card, it inserts where the line shows.
 */
export const PaletteRow = memo(function PaletteRow({ item, index, tabStop, active, onInsert, onFocusIndex, onPreview }: PaletteRowProps): React.JSX.Element {
  const drag = usePaletteDrag(item, false);
  const Glyph = blockGlyph(item.type);
  return (
    <div
      ref={drag.ref}
      role="option"
      aria-selected={active}
      tabIndex={tabStop ? 0 : -1}
      className="atlas-te-palette__row"
      data-item={itemKey(item)}
      data-active={active || undefined}
      onPointerDown={drag.onPointerDown}
      onPointerEnter={(event) => onPreview(item, event.currentTarget)}
      onClick={() => onInsert(item)}
      onFocus={(event) => {
        onFocusIndex(index);
        onPreview(item, event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onInsert(item);
      }}
    >
      <Glyph className="atlas-te-palette__row-glyph" aria-hidden="true" />
      <span className="atlas-te-palette__row-text">
        <span className="atlas-te-palette__row-name">{item.label}</span>
        <span className="atlas-te-palette__row-example">{item.example}</span>
      </span>
    </div>
  );
});
