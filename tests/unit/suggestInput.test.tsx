import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestInput } from '../../src/app/packages/components/primitives/SuggestInput';

const FIELDS = ['armor', 'hp', 'stats.0', 'stats.1'];

function Field({ onChange = vi.fn(), initial = '' }: { onChange?: (value: string) => void; initial?: string }): React.ReactElement {
  const [value, setValue] = useState(initial);
  return <SuggestInput value={value} suggestions={FIELDS} ariaLabel="Statblock field" placeholder="Statblock field, e.g. hp"
    onChange={(next) => { setValue(next); onChange(next); }} />;
}
const input = (): HTMLInputElement => screen.getByRole('combobox', { name: 'Statblock field' });
const options = (): string[] => screen.queryAllByRole('option').map((option) => option.textContent ?? '');

afterEach(cleanup);

describe('SuggestInput', () => {
  it('offers its suggestions in an Atlas list, not the browser\'s own', () => {
    const { container } = render(<Field />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.focus(input());
    expect(options()).toEqual(FIELDS);
    expect(container.querySelector('datalist')).toBeNull();
    expect(input().hasAttribute('list')).toBe(false);
  });

  it('takes any typed text and narrows the suggestions to what matches it', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'STAT' } });
    expect(onChange).toHaveBeenLastCalledWith('STAT');
    expect(options()).toEqual(['stats.0', 'stats.1']);
    fireEvent.change(input(), { target: { value: 'resources.mana' } });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with a click or with the arrow keys and Enter, and closes', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole('option', { name: 'hp' }));
    expect(onChange).toHaveBeenLastCalledWith('hp');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.change(input(), { target: { value: 'stats' } });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'stats.1' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('stats.1');
    expect(input().value).toBe('stats.1');
  });

  it('closes on Escape without passing the key on to the dialog around it, and on leaving the field', () => {
    const onDialogKey = vi.fn();
    render(<div onKeyDown={onDialogKey}><Field /></div>);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onDialogKey).not.toHaveBeenCalled();
    // Closed: Escape belongs to the dialog again
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onDialogKey).toHaveBeenCalledOnce();

    fireEvent.focus(input());
    fireEvent.blur(input());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
