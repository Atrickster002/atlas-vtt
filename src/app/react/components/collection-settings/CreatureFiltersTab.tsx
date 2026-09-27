/**
 * CreatureFiltersTab: the statblock fields the asset manager filters this
 * collection's characters by, with the fields its statblocks have to add.
 */

import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { discoverCreatureFields, type DiscoveredField } from '../../../creatures/creatureFieldDiscovery';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';
import { filterFields, filterForField, newCreatureFilterId } from '../../../gameSystems/creatureFilters';
import type { CreatureFilterDefinition } from '../../../types/creatureFilterTypes';
import { CreatureFieldSuggestions } from './CreatureFieldSuggestions';
import { CreatureFilterRow } from './CreatureFilterRow';

interface CreatureFiltersTabProps {
  filters: CreatureFilterDefinition[];
  onChange: (filters: CreatureFilterDefinition[]) => void;
  /** The statblocks linked to the collection's characters. */
  creatures: readonly IndexedCreature[];
  /** Whether those statblocks are still being read. */
  pending: boolean;
}

export function CreatureFiltersTab({ filters, onChange, creatures, pending }: CreatureFiltersTabProps): React.ReactElement {
  const discovered = useMemo(() => discoverCreatureFields(creatures), [creatures]);
  const unused = useMemo(() => {
    const used = new Set(filters.flatMap(filterFields));
    return discovered.filter((field) => !used.has(field.field));
  }, [discovered, filters]);

  const update = (index: number, filter: CreatureFilterDefinition): void => {
    onChange(filters.map((current, i) => (i === index ? filter : current)));
  };

  const move = (index: number, offset: -1 | 1): void => {
    const target = index + offset;
    if (target < 0 || target >= filters.length) return;
    const next = [...filters];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const addBlank = (): void => {
    onChange([...filters, { id: newCreatureFilterId(filters, 'filter'), label: '', kind: 'range', field: '' }]);
  };

  const addDiscovered = (field: DiscoveredField): void => {
    onChange([...filters, filterForField(filters, field.field, field.kind)]);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        Filter this collection&apos;s characters in the asset manager by what their linked
        statblocks say. A range filters numbers such as CR, level or tier; options filter
        categories such as type or role and can merge several fields.
      </p>

      {filters.length > 0 ? (
        <div className="atlas-csm-condition-list">
          {filters.map((filter, i) => (
            <CreatureFilterRow
              key={filter.id}
              filter={filter}
              isFirst={i === 0}
              isLast={i === filters.length - 1}
              onChange={(next) => update(i, next)}
              onMove={(offset) => move(i, offset)}
              onRemove={() => onChange(filters.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      ) : (
        <div className="atlas-csm-empty">No creature filters</div>
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={addBlank}>
        <Plus />
        Add filter
      </Button>

      <div className="atlas-csm-field">
        <div className="atlas-csm-label">Fields in this collection&apos;s statblocks</div>
        <CreatureFieldSuggestions fields={unused} statblockCount={creatures.length} pending={pending} onAdd={addDiscovered} />
      </div>
    </>
  );
}
