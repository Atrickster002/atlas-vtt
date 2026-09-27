import React, { useState } from 'react';
import type { FacetOption } from '../../../../../creatures/creatureFilterEngine';
import { Button } from '../../../primitives/button';

interface OptionFacetListProps {
  options: readonly FacetOption[];
  /** Names the list for assistive technology. */
  label: string;
  onToggle: (key: string) => void;
}

/** Options shown before "Show all". */
const COLLAPSED_COUNT = 8;

/**
 * The options of a filter, each toggled on click like a tag. Options no token
 * in view has are dimmed but stay pickable; the list folds after the most
 * common ones, but never hides a picked option.
 */
export function OptionFacetList({ options, label, onToggle }: OptionFacetListProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const foldable = options.length > COLLAPSED_COUNT + 1;
  const shown = !foldable || expanded
    ? options
    : options.filter((option, index) => index < COLLAPSED_COUNT || option.selected);

  return (
    <div className="atlas-filter-options" role="group" aria-label={label}>
      {shown.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`atlas-tag-button atlas-filter-option${option.selected ? ' atlas-active' : ''}${option.count === 0 ? ' atlas-empty' : ''}`}
          aria-pressed={option.selected}
          onClick={() => onToggle(option.key)}
        >
          <span className="atlas-tag-text">{option.label}</span>
          <span className="atlas-tag-count">{option.count}</span>
        </button>
      ))}
      {foldable && (
        <Button variant="ghost" className="atlas-filter-options__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${options.length}`}
        </Button>
      )}
    </div>
  );
}
