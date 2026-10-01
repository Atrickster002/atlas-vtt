import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneLightingSection } from '../../src/app/packages/components/toolbar/SceneLightingSection';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';

afterEach(cleanup);

function renderSection(overrides: Partial<React.ComponentProps<typeof SceneLightingSection>> = {}): React.ComponentProps<typeof SceneLightingSection> {
  const props = {
    lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true },
    onChange: vi.fn(),
    onResetExplored: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  render(<SceneLightingSection {...props} />);
  return props;
}

describe('SceneLightingSection', () => {
  it('switches dynamic lighting on', () => {
    const props = renderSection({ lighting: DEFAULT_SCENE_LIGHTING });
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('switches dynamic lighting from the keyboard', () => {
    const props = renderSection();
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(props.onChange.mock.calls).toEqual([[{ enabled: false }], [{ enabled: false }]]);
  });

  it('sets the ambient light from a time of day', () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }));
    expect(props.onChange).toHaveBeenCalledWith({ ambient: 0.15 });
  });

  it('hides the scene controls while lighting is off', () => {
    renderSection({ lighting: DEFAULT_SCENE_LIGHTING });
    expect(screen.queryByRole('radio', { name: 'Night' })).toBeNull();
    expect(screen.queryByText('Forget explored areas')).toBeNull();
  });

  it('forgets explored areas', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('Forget explored areas'));
    expect(props.onResetExplored).toHaveBeenCalled();
  });

  it('has no preview of its own: the GM view switch shows the players\' lighting', () => {
    renderSection();
    expect(screen.queryByText('Preview player view')).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('keeps its actions in a section of their own, as rows like every other menu\'s', () => {
    renderSection();
    const controls = screen.getByRole('switch').closest('.atlas-dropdown-section');
    const actions = screen.getByText('Forget explored areas').closest('.atlas-dropdown-section');
    expect(controls).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(actions).not.toBe(controls);
    expect(screen.getByText('Lighting settings…').closest('.atlas-dropdown-section')).toBe(actions);
    expect(screen.getByRole('radiogroup', { name: 'Time of day' }).closest('.atlas-dropdown-section')).toBe(controls);
    expect(screen.getByText('Forget explored areas').closest('button')?.classList.contains('atlas-dropdown-menu-item')).toBe(true);
  });

  it('leaves the toggle as the menu\'s last row while lighting is off', () => {
    const { container } = render(<SceneLightingSection lighting={DEFAULT_SCENE_LIGHTING} onChange={vi.fn()} onResetExplored={vi.fn()} onOpenSettings={vi.fn()} />);
    const sections = container.querySelectorAll('.atlas-dropdown-section');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.querySelector('.atlas-dropdown-toggle-row:last-child')).not.toBeNull();
  });

  it('tints the ambient light with the colour beside its slider', () => {
    const props = renderSection();
    const swatch = screen.getByLabelText('Ambient colour') as HTMLInputElement;
    expect(swatch.value).toBe('#ffffff');
    expect(swatch.classList.contains('atlas-swatch')).toBe(true);
    fireEvent.change(swatch, { target: { value: '#3366cc' } });
    expect(props.onChange).toHaveBeenCalledWith({ ambientColor: '#3366cc' });
  });

  it('shows the scene\'s ambient colour', () => {
    renderSection({ lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true, ambientColor: '#aa8844' } });
    expect((screen.getByLabelText('Ambient colour') as HTMLInputElement).value).toBe('#aa8844');
  });

  it('opens the lighting settings', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('Lighting settings…'));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });
});
