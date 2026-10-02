import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import type { Tool } from '../../src/app/packages/components/toolbar/toolFaces';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const bus = vi.hoisted(() => ({ current: null as EventEmitter | null }));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ view: { serviceManager: { getEventBus: () => bus.current } } }),
}));

const lights = vi.hoisted(() => ({ current: null as readonly unknown[] | null }));

// Without an Obsidian app the hook gives the generic presets; a test sets a game system's.
vi.mock('../../src/app/react/hooks/useMapLightPresets', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/app/react/hooks/useMapLightPresets')>();
  return { useMapLightPresets: () => lights.current ?? original.useMapLightPresets() };
});

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => `key:${id}`,
}));

import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { LightingToolGroup } from '../../src/app/packages/components/toolbar/LightingToolGroup';

afterEach(() => {
  cleanup();
  lights.current = null;
});

interface Rendered {
  store: ViewAtlasStore;
  selectTool: ReturnType<typeof vi.fn>;
  closeMenu: ReturnType<typeof vi.fn>;
  events: [string, unknown][];
  rerender: (activeTool: Tool) => void;
}

function renderGroup(activeTool: Tool = 'move'): Rendered {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-menu-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const events: [string, unknown][] = [];
  bus.current = new EventEmitter();
  const emit = bus.current.emit.bind(bus.current);
  bus.current.emit = (event: string, ...args: unknown[]): boolean => {
    events.push([event, args[0]]);
    return emit(event, ...args);
  };
  const selectTool = vi.fn();
  const closeMenu = vi.fn();
  const ui = (tool: Tool): React.ReactElement => (
    <TooltipProvider>
      <ViewStoreProvider store={store}>
        <LightingToolGroup activeTool={tool} selectTool={selectTool} menuOpen toggleMenu={vi.fn()} closeMenu={closeMenu} />
      </ViewStoreProvider>
    </TooltipProvider>
  );
  const view = render(ui(activeTool));
  return { store, selectTool, closeMenu, events, rerender: (tool) => view.rerender(ui(tool)) };
}

/** A menu row, as the fog and draw menus build theirs. */
function row(label: string): HTMLButtonElement {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`No row "${label}"`);
  expect(button.classList.contains('atlas-dropdown-menu-item')).toBe(true);
  return button;
}

function checked(label: string): boolean {
  return row(label).querySelector('.atlas-dropdown-menu-item__check svg') !== null;
}

function shortcut(label: string): string | null {
  return row(label).querySelector('.atlas-dropdown-menu-item__shortcut')?.textContent ?? null;
}

describe('LightingToolGroup', () => {
  it('offers what the tool does and how walls are drawn as menu rows', () => {
    renderGroup();
    for (const label of ['Draw walls', 'Place lights', 'Light zones', 'Point to point', 'Freehand']) row(label);
    expect(document.querySelector('.atlas-dropdown-mode-btn--active')).toBeNull();
  });

  it('ticks nothing the tool does while another tool is active', () => {
    renderGroup('move');
    expect(checked('Draw walls')).toBe(false);
    expect(checked('Place lights')).toBe(false);
  });

  it('ticks what the active lighting tool does, with the tool\'s shortcut on the row it selects', () => {
    renderGroup('wall');
    expect(checked('Draw walls')).toBe(true);
    expect(checked('Place lights')).toBe(false);
    expect(shortcut('Draw walls')).toBe('key:wall');
    expect(shortcut('Place lights')).toBeNull();
  });

  it('switches to placing lights, selects the tool and offers the light presets', () => {
    const { selectTool, events, rerender } = renderGroup('move');
    fireEvent.click(row('Place lights'));
    expect(events).toContainEqual(['wall-submode-changed', 'place-light']);
    expect(selectTool).toHaveBeenCalledWith('wall');
    rerender('wall');
    expect(checked('Place lights')).toBe(true);
    expect(checked('Draw walls')).toBe(false);
    expect(shortcut('Place lights')).toBe('key:wall');
    expect(screen.queryByText('Point to point')).toBeNull();
    for (const label of ['Candle', 'Torch', 'Lantern', 'Magical light']) row(label);
    expect(checked('Torch')).toBe(true);
    fireEvent.click(row('Lantern'));
    expect(events).toContainEqual(['lighting-preset-changed', 'lantern']);
    expect(checked('Lantern')).toBe(true);
    expect(checked('Torch')).toBe(false);
  });

  it('switches to drawing light zones, which has no choices of its own', () => {
    const { selectTool, events, rerender } = renderGroup('move');
    fireEvent.click(row('Light zones'));
    expect(events).toContainEqual(['wall-submode-changed', 'light-zone']);
    expect(selectTool).toHaveBeenCalledWith('wall');
    rerender('wall');
    expect(checked('Light zones')).toBe(true);
    expect(shortcut('Light zones')).toBe('key:wall');
    expect(screen.queryByText('Point to point')).toBeNull();
    expect(screen.queryByText('Torch')).toBeNull();
  });

  it('offers the light presets of the map\'s collection, its torch chosen until another is', () => {
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    lights.current = dnd5e;
    const { events } = renderGroup('wall');
    fireEvent.click(row('Place lights'));
    for (const preset of dnd5e) row(preset.name);
    expect(screen.queryByText('Magical light')).toBeNull();
    expect(checked('Torch')).toBe(true);
    fireEvent.click(row('Daylight'));
    expect(events).toContainEqual(['lighting-preset-changed', 'dnd5e-daylight']);
    expect(checked('Daylight')).toBe(true);
    expect(checked('Torch')).toBe(false);
  });

  it('goes back to the collection\'s torch when the chosen preset is no longer one of its lights', () => {
    const systems = BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.name === 'D&D 5e' || preset.name === 'Cairn');
    lights.current = systems.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    const { rerender } = renderGroup('wall');
    fireEvent.click(row('Place lights'));
    fireEvent.click(row('Daylight'));
    lights.current = systems.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
    rerender('wall');
    expect(screen.queryByText('Daylight')).toBeNull();
    expect(checked('Torch')).toBe(true);
  });

  it('ticks how walls are drawn and tells the tool', () => {
    const { events } = renderGroup('wall');
    expect(checked('Point to point')).toBe(true);
    fireEvent.click(row('Freehand'));
    expect(events).toContainEqual(['wall-mode-changed', 'freeform']);
    expect(checked('Freehand')).toBe(true);
    expect(checked('Point to point')).toBe(false);
  });

  it('switches the scene\'s lighting with a named switch and has no preview of its own', () => {
    const { store, events } = renderGroup('wall');
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(store.getState().lighting.enabled).toBe(true);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByText('Preview player view')).toBeNull();
    expect(events.some(([event]) => event === 'lighting-preview')).toBe(false);
  });

  it('forgets explored areas and opens the settings from rows that close the menu', () => {
    const { store, closeMenu, events } = renderGroup('wall');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    fireEvent.click(row('Forget explored areas'));
    expect(events).toContainEqual(['lighting-reset-explored', undefined]);
    fireEvent.click(row('Lighting settings…'));
    expect(store.getState().isSceneLightingPanelOpen).toBe(true);
    expect(closeMenu).toHaveBeenCalledTimes(2);
  });
});
