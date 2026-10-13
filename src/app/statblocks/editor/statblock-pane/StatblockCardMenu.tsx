import React from 'react';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { alignedEntries } from '../interaction/surfaceActions';

/**
 * The statblock's ⋯ in its card's top-right corner (§7.2), shown while the
 * pointer is over the card, focus is in it or its menu is open. The card's
 * first block keeps the corner free (statblock-pane.scss), so it covers
 * nothing; the template editor's card keeps the same room.
 */
export function StatblockCardMenu({ entries }: { entries: ContextMenuEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div className="atlas-sb-card-menu">
      <ActionsMenuButton label="Statblock options" entries={alignedEntries(entries)} className="atlas-sb-card-menu__button" />
    </div>
  );
}
