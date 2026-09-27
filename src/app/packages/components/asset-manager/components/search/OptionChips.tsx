import React, { useState } from 'react';
import type { FacetOption } from '../../../../../creatures/creatureFilterEngine';
import { Button } from '../../../primitives/button';

interface OptionChipsProps {
  options: readonly FacetOption[];
  /** Names the group for assistive technology. */
  label: string;
  onToggle: (key: string) => void;
}

/** Chips shown before "Show all". */
const COLLAPSED_COUNT = 12;

/**
 * The options of a filter as chips with counts, toggled on click. Options no
 * asset in view has are dimmed but stay pickable; the list folds after the most
 * common ones, but never hides a picked option.
 */
export function OptionChips({ options, label, onToggle }: OptionChipsProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const foldable = options.length > COLLAPSED_COUNT + 2;
  const shown = !foldable || expanded
    ? options
    : options.filter((option, index) => index < COLLAPSED_COUNT || option.selected);

  return (
    <div className="atlas-filter-chips" role="group" aria-label={label}>
      {shown.map((option) => (
        <Button
          key={option.key}
          variant="ghost"
          className={`atlas-filter-chip${option.selected ? ' atlas-active' : ''}${option.count === 0 ? ' atlas-empty' : ''}`}
          aria-pressed={option.selected}
          onClick={() => onToggle(option.key)}
        >
          <span className="atlas-filter-chip__label">{option.label}</span>
          <span className="atlas-filter-chip__count">{option.count}</span>
        </Button>
      ))}
      {foldable && (
        <Button variant="ghost" className="atlas-filter-chips__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${options.length}`}
        </Button>
      )}
    </div>
  );
}
