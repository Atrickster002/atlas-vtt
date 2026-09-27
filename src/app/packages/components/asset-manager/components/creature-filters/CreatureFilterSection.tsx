import React from 'react';
import type { HiddenSummary } from '../../../../../creatures/creatureFilterEngine';
import {
  toggleLayout, toggleOption, toggleSize, withRange, withStatblockFilter,
} from '../../../../../creatures/creatureSelection';
import { formatRating } from '../../../../../creatures/creatureValues';
import { TOKEN_SIZE_OPTIONS } from '../../../../../pixi/token-renderer/tokenSizing';
import { emptyCreatureSelection, type StatblockLinkFilter } from '../../../../../types/creatureFilterTypes';
import { LoadingSpinner } from '../../../primitives/LoadingSpinner';
import { SegmentedControl } from '../../../primitives/SegmentedControl';
import type { CreatureFilterPanel } from '../../hooks/useCreatureFilters';
import { ClearTagsChip } from '../ClearTagsChip';
import { FilterFacet } from './FilterFacet';
import { OptionFacetList } from './OptionFacetList';
import { RangeFacet } from './RangeFacet';

const STATBLOCK_OPTIONS = [
  { value: 'any', label: 'All' },
  { value: 'linked', label: 'Linked' },
  { value: 'unlinked', label: 'Not linked' },
] as const;

/** "Medium (1×1)" for the sizes Atlas offers, the multiplier otherwise. */
function sizeLabel(size: number): string {
  return TOKEN_SIZE_OPTIONS.find((option) => option.size === size)?.label ?? `Size ${formatRating(size)}`;
}

function hiddenText({ withoutStatblock, withoutField }: HiddenSummary): string | null {
  const parts = [
    ...(withoutStatblock > 0 ? [`${withoutStatblock} without a statblock`] : []),
    ...withoutField.map(({ label, count }) => `${count} without ${label}`),
  ];
  return parts.length > 0 ? `Hidden: ${parts.join(', ')}` : null;
}

/** The Characters tab's filters on what linked statblocks say, below the tags. */
export function CreatureFilterSection({ panel }: { panel: CreatureFilterPanel }): React.JSX.Element {
  const { selection, setSelection, result, activeCount, pending } = panel;
  const { facets } = result;
  const hidden = hiddenText(result.hidden);

  return (
    <section className="atlas-creature-filters" aria-label="Character filters">
      <div className="atlas-tags-header">
        <div className="atlas-tags-heading">
          <div className="atlas-section-title">Filters</div>
          <ClearTagsChip
            count={activeCount}
            onClear={() => setSelection(emptyCreatureSelection)}
            label={activeCount === 1 ? 'Clear filter' : `Clear ${activeCount} filters`}
          />
        </div>
        {pending && <LoadingSpinner size={14} className="atlas-creature-filters__pending" />}
      </div>

      <FilterFacet title="Statblock" active={selection.statblock !== 'any'}>
        <SegmentedControl
          className="atlas-creature-filters__statblock"
          ariaLabel="Statblock"
          value={selection.statblock}
          options={STATBLOCK_OPTIONS}
          onChange={(value: StatblockLinkFilter) => setSelection((current) => withStatblockFilter(current, value))}
        />
      </FilterFacet>

      {(facets.layouts.length > 1 || selection.layouts.length > 0) && (
        <FilterFacet title="Statblock type" active={selection.layouts.length > 0}>
          <OptionFacetList
            label="Statblock type"
            options={facets.layouts}
            onToggle={(layout) => setSelection((current) => toggleLayout(current, layout))}
          />
        </FilterFacet>
      )}

      {(facets.sizes.length > 1 || selection.sizes.length > 0) && (
        <FilterFacet title="Size" active={selection.sizes.length > 0}>
          <OptionFacetList
            label="Size"
            options={facets.sizes.map(({ size, count, selected }) => ({ key: String(size), label: sizeLabel(size), count, selected }))}
            onToggle={(key) => setSelection((current) => toggleSize(current, Number(key)))}
          />
        </FilterFacet>
      )}

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

      {hidden && <p className="atlas-creature-filters__hidden" role="status">{hidden}</p>}
    </section>
  );
}
