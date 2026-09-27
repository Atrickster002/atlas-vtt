import React from 'react';
import { FileWarning } from 'lucide-react';
import { CoinIcon } from '../CoinIcon';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';

interface LootEmptyStateProps {
  inCollection: boolean;
  /** Obsidian's Bases core plugin is on. */
  basesAvailable: boolean;
  loaded: boolean;
  baseCount: number;
}

/** What the loot roller shows before it has items to roll on, and how to give it some. */
export function LootEmptyState({ inCollection, basesAvailable, loaded, baseCount }: LootEmptyStateProps): React.ReactElement {
  if (inCollection && basesAvailable && !loaded) {
    return (
      <div className="atlas-loot-empty">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  const [title, body] = !inCollection
    ? ['This map is not in a collection', 'Loot comes from the bases of a collection. Move the map into one to roll loot on it.']
    : !basesAvailable
      ? ['Bases are turned off', 'The loot roller reads items from Obsidian Bases. Turn on the Bases core plugin in Obsidian’s settings, then reload Obsidian.']
      : baseCount === 0
        ? ['No loot bases yet', 'In the asset manager, open this collection’s settings and add a base of item notes under Loot.']
        : ['No items in the loot bases', 'The views of the collection’s loot bases list no notes. Every note a view lists is an item the roller can draw.'];

  return (
    <div className="atlas-loot-empty">
      <span className="atlas-loot-empty__icon">{baseCount > 0 || !basesAvailable ? <FileWarning /> : <CoinIcon />}</span>
      <p className="atlas-loot-empty__title">{title}</p>
      <p className="atlas-loot-empty__body">{body}</p>
    </div>
  );
}
