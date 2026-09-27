import type { CreatureFacets } from '../../../../creatures/creatureFilterEngine';
import { clearFacet, toggleLayout, toggleOption } from '../../../../creatures/creatureSelection';
import { formatRange } from '../../../../creatures/creatureValues';
import type { CreatureFilterDefinition, CreatureFilterSelection } from '../../../../types/creatureFilterTypes';
import type { Tag } from '../types';

type Update<T> = (update: (current: T) => T) => void;

export interface FilterChip {
  key: string;
  label: string;
  remove: () => void;
}

/** The active values of one filter: one chip, or a group that lists them. */
export interface FilterChipGroup {
  key: string;
  category: string;
  items: FilterChip[];
  removeAll: () => void;
}

interface ChipSources {
  selection: CreatureFilterSelection;
  definitions: readonly CreatureFilterDefinition[];
  facets: CreatureFacets | null;
  tagIds: readonly string[];
  tags: readonly Tag[];
  setSelection: Update<CreatureFilterSelection>;
  setTagIds: Update<string[]>;
}

/** Every active filter as removable chips, in the order the filter panel lists them. */
export function activeFilterChips({ selection, definitions, facets, tagIds, tags, setSelection, setTagIds }: ChipSources): FilterChipGroup[] {
  const groups: FilterChipGroup[] = [];
  const clear = (facet: string) => (): void => setSelection((current) => clearFacet(current, facet));

  if (selection.statblock !== 'any') {
    groups.push({
      key: 'statblock',
      category: 'Statblock',
      items: [{ key: selection.statblock, label: selection.statblock === 'linked' ? 'With statblock' : 'Without statblock', remove: clear('statblock') }],
      removeAll: clear('statblock'),
    });
  }
  for (const definition of definitions) {
    if (definition.kind === 'range') {
      const range = selection.ranges[definition.id];
      if (range) groups.push({ key: definition.id, category: definition.label, items: [{ key: 'range', label: formatRange(range), remove: clear(definition.id) }], removeAll: clear(definition.id) });
      continue;
    }
    const picked = selection.options[definition.id] ?? [];
    if (picked.length === 0) continue;
    const labels = facets?.options.find((facet) => facet.definition.id === definition.id)?.options;
    groups.push({
      key: definition.id,
      category: definition.label,
      items: picked.map((key) => ({
        key,
        label: labels?.find((option) => option.key === key)?.label ?? key,
        remove: () => setSelection((current) => toggleOption(current, definition.id, key)),
      })),
      removeAll: clear(definition.id),
    });
  }
  if (selection.layouts.length > 0) {
    groups.push({
      key: 'layouts',
      category: 'Layout',
      items: selection.layouts.map((layout) => ({ key: layout, label: layout, remove: () => setSelection((current) => toggleLayout(current, layout)) })),
      removeAll: clear('layouts'),
    });
  }
  if (tagIds.length > 0) {
    groups.push({
      key: 'tags',
      category: 'Tag',
      items: tagIds.map((id) => ({
        key: id,
        label: tags.find((tag) => tag.id === id)?.name ?? id,
        remove: () => setTagIds((current) => current.filter((other) => other !== id)),
      })),
      removeAll: () => setTagIds(() => []),
    });
  }
  return groups;
}
