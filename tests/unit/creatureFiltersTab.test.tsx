import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import { CreatureFiltersTab } from '../../src/app/react/components/collection-settings/CreatureFiltersTab';
import type { CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';

afterEach(cleanup);

const creature = (fields: Record<string, unknown>): IndexedCreature => ({ path: String(fields.name), layout: null, fields });
const CREATURES = [
  creature({ name: 'Acid Burrower', tier: 1, type: 'Solo', difficulty: 14 }),
  creature({ name: 'Bear', tier: 1, type: 'Bruiser', difficulty: 14 }),
  creature({ name: 'Dryad', tier: 3, type: 'Leader', difficulty: 16 }),
];

let latest: CreatureFilterDefinition[] = [];

function Harness({ initial, creatures = CREATURES, pending = false }: { initial: CreatureFilterDefinition[]; creatures?: IndexedCreature[]; pending?: boolean }): React.JSX.Element {
  const [filters, setFilters] = useState(initial);
  latest = filters;
  return <CreatureFiltersTab filters={filters} onChange={setFilters} creatures={creatures} pending={pending} />;
}

const suggestions = (): string[] => within(screen.getByRole('list', { name: 'Statblock fields' })).getAllByRole('listitem').map((item) => item.querySelector('code')?.textContent ?? '');

it('suggests the fields of the collection’s statblocks that no filter reads', () => {
  render(<Harness initial={[{ id: 'tier', label: 'Tier', kind: 'range', field: 'tier' }]} />);
  expect(suggestions()).toEqual(['difficulty', 'type']);
  expect(screen.getAllByText('3 of 3')).toHaveLength(2);
});

it('adds a suggested field as a filter of the detected kind, labelled after it', () => {
  render(<Harness initial={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter by type' }));
  expect(latest).toEqual([{ id: 'type', label: 'Type', kind: 'options', fields: ['type'] }]);
  expect(suggestions()).not.toContain('type');
});

it('edits, retypes, reorders and removes filters', () => {
  render(<Harness initial={[
    { id: 'tier', label: 'Tier', kind: 'range', field: 'tier' },
    { id: 'role', label: 'Role', kind: 'options', fields: ['type'] },
  ]} />);
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Filter label' })[1]!, { target: { value: 'Adversary type' } });
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Statblock fields' })[1]!, { target: { value: 'type, subtype' } });
  expect(latest[1]).toEqual({ id: 'role', label: 'Adversary type', kind: 'options', fields: ['type', 'subtype'] });

  fireEvent.click(within(screen.getAllByRole('radiogroup')[0]!).getByRole('radio', { name: 'Options' }));
  expect(latest[0]).toEqual({ id: 'tier', label: 'Tier', kind: 'options', fields: ['tier'] });

  fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);
  expect(latest.map((filter) => filter.id)).toEqual(['role', 'tier']);

  fireEvent.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]!);
  expect(latest.map((filter) => filter.id)).toEqual(['tier']);
});

it('marks a filter without a field', () => {
  render(<Harness initial={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
  expect(screen.getByRole('textbox', { name: 'Statblock fields' }).getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Name the statblock field this filter reads.')).toBeTruthy();
});

it('explains what to do while no statblocks are linked, and shows progress while reading them', () => {
  const { unmount } = render(<Harness initial={[]} creatures={[]} />);
  expect(screen.getByText(/Link statblocks to this collection/)).toBeTruthy();
  unmount();
  render(<Harness initial={[]} creatures={[]} pending />);
  expect(screen.getByText('Reading statblocks…')).toBeTruthy();
});
