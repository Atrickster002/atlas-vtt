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
    expect(added).toMatchObject({ direction: 'drains', look: 'bar', visibleToPlayers: false });
    expect(isDraftResourceKey(added.key)).toBe(true);
  });

  it('keeps the key when the resource is renamed', () => {
    const onChange = vi.fn();
    render(<ResourcesTab resources={[{ ...HP_RESOURCE }]} onChange={onChange} fieldSuggestions={[]} />);
    fireEvent.change(screen.getByDisplayValue('HP'), { target: { value: 'Hit Protection' } });
    expect(onChange.mock.calls.at(-1)![0][0]).toMatchObject({ key: 'hp', name: 'Hit Protection' });
  });

  it('switches direction, look and player visibility', () => {
    const onChange = vi.fn();
    render(<ResourcesTab resources={[{ ...HP_RESOURCE }]} onChange={onChange} fieldSuggestions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /fills/i }));
    expect(onChange.mock.calls.at(-1)![0][0].direction).toBe('fills');
    fireEvent.click(screen.getByRole('button', { name: /badge/i }));
    expect(onChange.mock.calls.at(-1)![0][0].look).toBe('badge');
  });
});
