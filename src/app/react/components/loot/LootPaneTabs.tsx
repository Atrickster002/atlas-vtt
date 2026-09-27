import React from 'react';
import { History, Sparkles } from 'lucide-react';
import type { LootPane } from '../../../stores/lootRollerSlice';

interface LootPaneTabsProps {
  pane: LootPane;
  historyCount: number;
  onSelect: (pane: LootPane) => void;
  onClearHistory: () => void;
}

/** Switches the list between the latest roll and the collection's history. */
export function LootPaneTabs({ pane, historyCount, onSelect, onClearHistory }: LootPaneTabsProps): React.ReactElement {
  return (
    <div className="atlas-loot-pane-tabs">
      <div className="atlas-loot-pane-tabs__switch" role="tablist" aria-label="Loot list">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'results'}
          className={`atlas-loot-pane-tab${pane === 'results' ? ' atlas-active' : ''}`}
          onClick={() => onSelect('results')}
        >
          <Sparkles />
          Latest roll
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'history'}
          className={`atlas-loot-pane-tab${pane === 'history' ? ' atlas-active' : ''}`}
          onClick={() => onSelect('history')}
        >
          <History />
          History
          <span className="atlas-tab-count">{historyCount}</span>
        </button>
      </div>
      {pane === 'history' && historyCount > 0 && (
        <button type="button" className="atlas-loot-text-button" onClick={onClearHistory}>Clear history</button>
      )}
    </div>
  );
}
