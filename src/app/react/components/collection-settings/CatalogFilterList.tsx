import React from 'react';
import { CATALOG_CREATURE_FILTERS } from '../../../creatures/creatureFieldCatalog';
import { countCreaturesWith } from '../../../creatures/creatureFieldDiscovery';
import { filterFields } from '../../../creatures/creatureFilterDefinitions';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';

interface CatalogFilterListProps {
  /** Ids of the filters switched off. */
  hidden: readonly string[];
  onHiddenChange: (hidden: string[]) => void;
  creatures: readonly IndexedCreature[];
  pending: boolean;
}

/** Atlas' own filters, each switched on or off, with how many of the collection's statblocks have its field. */
export function CatalogFilterList({ hidden, onHiddenChange, creatures, pending }: CatalogFilterListProps): React.JSX.Element {
  const toggle = (id: string): void => {
    onHiddenChange(hidden.includes(id) ? hidden.filter((other) => other !== id) : [...hidden, id]);
  };

  return (
    <ul className="atlas-csm-creature-fields" aria-label="Atlas filters">
      {CATALOG_CREATURE_FILTERS.map((filter) => {
        const fields = filterFields(filter);
        const count = countCreaturesWith(creatures, fields);
        const coverage = pending ? 'Reading statblocks…'
          : creatures.length === 0 ? 'No linked statblocks'
            : count === 0 ? 'Not in these statblocks' : `${count} of ${creatures.length}`;
        return (
          <li key={filter.id} className="atlas-csm-creature-field">
            <div className="atlas-csm-creature-field__text">
              <span className="atlas-csm-toggle-label">{filter.label}</span>
              <code className="atlas-csm-hint">{fields.length > 1 ? `${fields[0]} +${fields.length - 1}` : fields[0]}</code>
            </div>
            <span className="atlas-csm-creature-field__count">{coverage}</span>
            <label className="atlas-csm-switch">
              <input
                type="checkbox"
                aria-label={`Filter by ${filter.label.toLowerCase()}`}
                checked={!hidden.includes(filter.id)}
                onChange={() => toggle(filter.id)}
              />
              <span className="atlas-csm-switch-track" />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
