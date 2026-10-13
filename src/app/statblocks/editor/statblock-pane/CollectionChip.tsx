import React from 'react';
import type { CollectionContext } from '../collectionContext';
import { PaneMenuButton } from './PaneMenuButton';

interface CollectionChipProps {
  context: CollectionContext;
  onChange: (collectionId: string) => void;
}

/**
 * The collection the pane works for, "Marsh campaign ▾" (§7.1): shown only
 * where more than one could apply. It decides the roles the header names and
 * offers for a new statblock.
 */
export function CollectionChip({ context, onChange }: CollectionChipProps): React.JSX.Element | null {
  if (!context.switchable) return null;
  const current = context.collections.find((collection) => collection.id === context.collectionId);
  const linking = new Set(context.linking);
  // Collections whose tokens link the note come first.
  const ordered = [...context.collections].sort((a, b) => Number(linking.has(b.id)) - Number(linking.has(a.id)));
  return (
    <PaneMenuButton
      className="atlas-sb-pane-collection"
      entries={ordered.map((collection) => ({
        type: 'item',
        label: collection.name,
        checked: collection.id === context.collectionId,
        onClick: () => onChange(collection.id),
      }))}
    >
      {current?.name ?? 'Collection'}
    </PaneMenuButton>
  );
}
