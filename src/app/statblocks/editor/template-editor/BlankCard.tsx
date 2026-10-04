import React from 'react';
import { Plus } from 'lucide-react';
import { insertItemFor, itemKey, type InsertItem } from './insertItems';

/**
 * The four rows of a blank template's ghost card, each the block it stands
 * for (spec §12.4); whole statblocks to start from are the gallery's.
 */
const GHOST_ROWS: ReadonlyArray<{ label: string; item: InsertItem }> = [
  { label: 'Name', item: insertItemFor('title') },
  { label: 'A line under the name', item: insertItemFor('line') },
  { label: 'A value', item: insertItemFor('stat') },
  { label: 'A list', item: insertItemFor('entries') },
];

export interface BlankCardProps {
  /** Unset while the template takes no edits. */
  onInsert?: ((item: InsertItem) => void) | undefined;
}

/** What a template without blocks shows (spec §12.4): a ghost of a card whose rows each insert what they name. */
export function BlankCard({ onInsert }: BlankCardProps): React.JSX.Element {
  return (
    <div className="atlas-te-blank" role="group" aria-label="Empty template">
      {GHOST_ROWS.map(({ label, item }) => (
        <button
          key={label}
          type="button"
          className="atlas-te-blank__row atlas-te-chrome-control"
          data-row={itemKey(item)}
          disabled={!onInsert}
          onClick={() => onInsert?.(item)}
        >
          <Plus aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
