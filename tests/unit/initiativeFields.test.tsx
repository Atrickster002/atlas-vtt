import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeFields } from '../../src/app/react/components/collection-settings/InitiativeFields';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

describe('the collection settings\' initiative fields', () => {
  it('offers the roll in turn order and passes on what is typed', () => {
    const onChange = vi.fn();
    render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);

    expect(screen.queryByText('Acts First')).toBeNull();
    fireEvent.change(screen.getByLabelText('Initiative Roll'), { target: { value: '1d10' } });
    expect(onChange).toHaveBeenCalledWith({ ...TURN_ORDER, roll: '1d10' });
  });

  it('says so while the roll is no dice', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, roll: '1d' }} onChange={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toMatch(/one group of dice/);
    expect(screen.getByLabelText('Initiative Roll').getAttribute('aria-invalid')).toBe('true');
  });

  it('offers the side that acts first, and no roll, by sides', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, mode: 'sides' }} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Initiative Roll')).toBeNull();
    expect(screen.getByText('Acts First')).toBeDefined();
    expect(screen.getByText(/Nothing is rolled/)).toBeDefined();
  });

  it('passes on the statblock field typed for the modifier, and no field once it is cleared', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Modifier field'), { target: { value: 'combat.init' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifierField: 'combat.init' });

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, modifierField: 'x' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Modifier field'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(TURN_ORDER);
  });

  it('offers the statblocks\' fields as chips, narrowed by what is typed', () => {
    const onChange = vi.fn();
    const suggestions = [{ path: 'initiative', label: 'Initiative' }, { path: 'dex_mod' }];
    const { rerender } = render(<InitiativeFields fieldSuggestions={suggestions} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /dex_mod/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifierField: 'dex_mod' });

    rerender(<InitiativeFields fieldSuggestions={suggestions} initiative={{ ...TURN_ORDER, modifierField: 'ini' }} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /dex_mod/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Initiative/ })).toBeDefined();
  });

  it('offers no modifier by sides, where nothing is rolled', () => {
    render(<InitiativeFields fieldSuggestions={[{ path: 'initiative' }]} initiative={{ ...TURN_ORDER, mode: 'sides' }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Modifier field')).toBeNull();
  });
});
