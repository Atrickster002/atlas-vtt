import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResourcesTab } from '../../src/app/react/components/collection-settings/ResourcesTab';
import { HP_RESOURCE, isDraftResourceKey } from '../../src/app/resources/resourceDefinitions';

describe('ResourcesTab', () => {
  it('adds a resource whose key is settled when it is saved', () => {
    const onChange = vi.fn();
    render(<ResourcesTab resources={[{ ...HP_RESOURCE }]} onChange={onChange} fieldSuggestions={['hp', 'ammo']} />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));
    const added = onChange.mock.calls.at(-1)![0].at(-1);
    expect(added).toMatchObject({ direction: 'drains', visibleToPlayers: false });
    expect(isDraftResourceKey(added.key)).toBe(true);
  });

  it('keeps the key when the resource is renamed', () => {
    const onChange = vi.fn();
    render(<ResourcesTab resources={[{ ...HP_RESOURCE }]} onChange={onChange} fieldSuggestions={[]} />);
    fireEvent.change(screen.getByDisplayValue('HP'), { target: { value: 'Hit Protection' } });
    expect(onChange.mock.calls.at(-1)![0][0]).toMatchObject({ key: 'hp', name: 'Hit Protection' });
  });

  it('switches direction and player visibility', () => {
    const onChange = vi.fn();
    render(<ResourcesTab resources={[{ ...HP_RESOURCE }]} onChange={onChange} fieldSuggestions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /fills/i }));
    expect(onChange.mock.calls.at(-1)![0][0].direction).toBe('fills');
    fireEvent.click(screen.getByRole('button', { name: /hidden from players/i }));
    expect(onChange.mock.calls.at(-1)![0][0].visibleToPlayers).toBe(true);
  });

  it('names each row by its shape and stops at four resources', () => {
    const four = ['HP', 'STR', 'Ammo', 'Luck'].map((name) => ({ ...HP_RESOURCE, key: name.toLowerCase(), name }));
    render(<ResourcesTab resources={four} onChange={vi.fn()} fieldSuggestions={[]} />);
    expect(screen.getAllByText('Bar')).toHaveLength(2);
    expect(screen.getAllByText('Wheel, on hover')).toHaveLength(2);
    expect((screen.getByRole('button', { name: /add resource/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
