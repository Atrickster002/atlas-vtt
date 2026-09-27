import React from 'react';
import type { CreatureFacets, HiddenSummary } from '../../../../../creatures/creatureFilterEngine';
import { toggleLayout, toggleOption, withoutFieldFilters, withRange } from '../../../../../creatures/creatureSelection';
import type { CreatureFilterSelection } from '../../../../../types/creatureFilterTypes';
import { LoadingSpinner } from '../../../primitives/LoadingSpinner';
import type { CreatureFilterPanel } from '../../hooks/useCreatureFilters';
import { ClearTagsChip } from '../ClearTagsChip';
import { FilterFacet } from './FilterFacet';
import { OptionFacetList } from './OptionFacetList';
import { RangeFacet } from './RangeFacet';

function hiddenText({ withoutStatblock, withoutField }: HiddenSummary): string | null {
  const parts = [
    ...(withoutStatblock > 0 ? [`${withoutStatblock} without a statblock`] : []),
    ...withoutField.map(({ label, count }) => `${count} without ${label.toLowerCase()}`),
  ];
  return parts.length > 0 ? `Hidden: ${parts.join(', ')}` : null;
}

/** Whether the statblocks in view give any filter something to pick, or something is picked. */
function hasFacets(facets: CreatureFacets, selection: CreatureFilterSelection): boolean {
  return facets.layouts.length > 1 || selection.layouts.length > 0
    || facets.ranges.some((facet) => facet.values.length > 1 || facet.selected)
    || facets.options.some((facet) => facet.options.length > 0);
}

/**
 * The Characters tab's filters on what linked statblocks say, below the tags.
 * Only filters whose fields the statblocks in view have are shown.
 */
export function CreatureFilterSection({ panel }: { panel: CreatureFilterPanel }): React.JSX.Element | null {
  const { selection, setSelection, result, activeCount, pending } = panel;
  const { facets } = result;
  if (!hasFacets(facets, selection)) return null;
  const hidden = hiddenText(result.hidden);

  return (
    <section className="atlas-creature-filters" aria-label="Character filters">
      <div className="atlas-tags-header">
        <div className="atlas-tags-heading">
          <div className="atlas-section-title">Filters</div>
          <ClearTagsChip
            count={activeCount}
            onClear={() => setSelection(withoutFieldFilters)}
            label={activeCount === 1 ? 'Clear filter' : `Clear ${activeCount} filters`}
          />
        </div>
        {pending && <LoadingSpinner size={14} className="atlas-creature-filters__pending" />}
      </div>

      {facets.ranges.map((facet) => (
        <RangeFacet
          key={facet.definition.id}
          facet={facet}
          onChange={(range) => setSelection((current) => withRange(current, facet.definition.id, range))}
        />
      ))}

      {facets.options.map((facet) => (facet.options.length > 0 && (
        <FilterFacet key={facet.definition.id} title={facet.definition.label} active={facet.options.some((option) => option.selected)}>
          <OptionFacetList
            label={facet.definition.label}
            options={facet.options}
            onToggle={(key) => setSelection((current) => toggleOption(current, facet.definition.id, key))}
          />
        </FilterFacet>
      )))}

      {(facets.layouts.length > 1 || selection.layouts.length > 0) && (
        <FilterFacet title="Layout" active={selection.layouts.length > 0}>
          <OptionFacetList
            label="Layout"
            options={facets.layouts}
            onToggle={(layout) => setSelection((current) => toggleLayout(current, layout))}
          />
        </FilterFacet>
      )}

      {hidden && <p className="atlas-creature-filters__hidden" role="status">{hidden}</p>}
    </section>
  );
}
