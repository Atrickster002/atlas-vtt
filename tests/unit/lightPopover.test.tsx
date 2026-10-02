import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { genericLight } from '../mocks/lights';
import { LightPopoverHost } from '../../src/app/pixi/lighting/LightPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { LightKind, LightSource } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom has no pointer capture, which the slider takes on a press.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

interface Rendered {
  store: ViewAtlasStore;
  torch: string;
  lantern: string;
  light: (id?: string) => LightSource;
  steps: () => number;
  undo: () => void;
  mapKeys: ReturnType<typeof vi.fn>;
}

function renderPopover(open = true): Rendered {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-popover-ui-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/popover.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  const lantern = store.getState().addLight({ x: 600, y: 300, emission: { ...genericLight('lantern'), kind: 'lantern' } });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  // The map's shortcuts listen on the window; the popover's own keys must not reach them.
  const mapKeys = vi.fn();
  window.addEventListener('keydown', mapKeys);
  render(
    <button type="button">Map</button>,
  );
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><LightPopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  if (open) act(() => store.getState().openLightPopover(torch));
  return {
    store, torch, lantern, mapKeys,
    light: (id = torch) => store.getState().objects.lights[id]!,
    steps: () => history.getState().pastStates.length,
    undo: () => act(() => history.getState().undo()),
  };
}

const popover = (): HTMLElement => screen.getByRole('dialog', { name: 'Light' });

describe('LightPopover', () => {
  it('is closed until a light is opened', () => {
    renderPopover(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names every control: kinds, colours, ranges, sliders, flicker and the actions', () => {
    renderPopover();
    for (const kind of ['Candle', 'Torch', 'Lantern', 'Magical light', 'Darkness', 'Custom light']) screen.getByRole('button', { name: kind });
    expect(screen.getByRole('group', { name: 'Kind of light' })).toBeTruthy();
    for (const colour of ['Candle amber', 'Torch orange', 'Lantern gold', 'Warm white', 'Arcane blue', 'Fey green', 'Ember red']) screen.getByRole('button', { name: colour });
    expect(screen.getByLabelText('Custom colour')).toBeTruthy();
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('40');
    expect(screen.getByText('ft')).toBeTruthy();
    for (const slider of ['Bright range', 'Dim range', 'Intensity', 'Softness', 'Beam']) screen.getByRole('slider', { name: slider });
    expect(screen.getByRole('combobox', { name: 'Flicker' }).textContent).toBe('Torch');
    screen.getByRole('button', { name: 'Turn off' });
    screen.getByRole('button', { name: 'Delete' });
    expect(popover().querySelector('[title]')).toBeNull();
  });

  it('marks the light\'s kind and gives it another kind\'s preset in one undo step', () => {
    const { light, steps, undo } = renderPopover();
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Lantern' }));
    expect(light().emission).toMatchObject({ kind: 'lantern', bright: 30, dim: 60, color: '#ffd28a' });
    expect(screen.getByRole('button', { name: 'Lantern' }).getAttribute('aria-pressed')).toBe('true');
    expect(steps()).toBe(1);
    undo();
    expect(light().emission.kind).toBe('torch');
  });

  it('marks a light whose stored kind it does not know as the preset it equals, else as custom', () => {
    const { store, torch, light } = renderPopover();
    const unknown = 'brazier' as LightKind;
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, kind: unknown } }));
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 12 } }));
    expect(screen.getByRole('button', { name: 'Custom light' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the light as it is when it is made a custom light', () => {
    const { light } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Custom light' }));
    expect(light().emission).toMatchObject({ kind: 'custom', bright: 20, dim: 40, color: '#ff9a3c' });
  });

  it('makes the light a source of magical darkness with the Darkness kind: one radius, and none of a light\'s controls', () => {
    const { light, steps } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Darkness' }));
    expect(light().emission).toMatchObject({ darkness: true, kind: 'darkness', bright: 0, dim: 15 });
    expect(steps()).toBe(1);
    expect(screen.getByRole('button', { name: 'Darkness' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Radius') as HTMLInputElement).value).toBe('15');
    screen.getByRole('slider', { name: 'Darkness radius' });
    expect(screen.queryByLabelText('Bright')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Candle amber' })).toBeNull();
    for (const slider of ['Intensity', 'Softness', 'Bright range', 'Beam', 'Direction']) expect(screen.queryByRole('slider', { name: slider })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Flicker' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Outshines magical darkness' })).toBeNull();
    // Its one radius is typed like a light's range.
    const radius = screen.getByLabelText('Radius');
    fireEvent.change(radius, { target: { value: '20' } });
    fireEvent.keyDown(radius, { key: 'Enter' });
    expect(light().emission).toMatchObject({ darkness: true, bright: 0, dim: 20 });
    // Made a custom light it stays a darkness; another kind's preset makes it a light again.
    fireEvent.click(screen.getByRole('button', { name: 'Custom light' }));
    expect(light().emission).toMatchObject({ darkness: true, kind: 'custom', dim: 20 });
    expect(screen.getByLabelText('Radius')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Torch' }));
    expect(light().emission).not.toHaveProperty('darkness');
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('20');
  });

  it('lets a light outshine magical darkness, and stores nothing for one that does not', () => {
    const { light } = renderPopover();
    const outshines = screen.getByRole('switch', { name: 'Outshines magical darkness' });
    expect(outshines.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(outshines);
    expect(light().emission.priority).toBe(1);
    expect(outshines.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(outshines);
    expect(light().emission).not.toHaveProperty('priority');
  });

  it('narrows the light to a beam, and offers its direction only while it has one', () => {
    const { light, steps, undo } = renderPopover();
    const beam = screen.getByRole('slider', { name: 'Beam' });
    expect(screen.getByText('All around')).toBeTruthy();
    expect(screen.queryByRole('slider', { name: 'Direction' })).toBeNull();
    act(() => beam.focus());
    fireEvent.keyDown(beam, { key: 'ArrowLeft' });
    expect(light().emission.angle).toBe(355);
    expect(screen.getByText('355°')).toBeTruthy();
    const direction = screen.getByRole('slider', { name: 'Direction' });
    act(() => direction.focus());
    fireEvent.keyDown(direction, { key: 'ArrowRight' });
    expect(light().rotation).toBe(5);
    expect(steps()).toBe(2);
    undo();
    expect(light().rotation ?? 0).toBe(0);
    fireEvent.keyDown(beam, { key: 'End' });
    expect('angle' in light().emission).toBe(false);
    expect(screen.queryByRole('slider', { name: 'Direction' })).toBeNull();
  });

  it('shows the beam of a light that has one, as the map changes it', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { rotation: 135, emission: { ...light().emission, angle: 53 } }));
    expect(screen.getByRole('slider', { name: 'Beam' }).getAttribute('aria-valuenow')).toBe('53');
    expect(screen.getByRole('slider', { name: 'Direction' }).getAttribute('aria-valuenow')).toBe('135');
    expect(screen.getByText('53°')).toBeTruthy();
    expect(screen.getByText('135°')).toBeTruthy();
  });

  it('keeps its kind when a value is changed', () => {
    const { light } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Arcane blue' }));
    expect(light().emission).toMatchObject({ kind: 'torch', color: '#8fb8ff' });
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Arcane blue' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes every colour tried in the system picker as one undo step', () => {
    const { light, steps, undo } = renderPopover();
    const picker = screen.getByLabelText('Custom colour') as HTMLInputElement;
    // The picker sends `input` while a colour is tried and `change` once, when it closes.
    fireEvent.input(picker, { target: { value: '#112233' } });
    fireEvent.input(picker, { target: { value: '#445566' } });
    expect(light().emission.color).toBe('#445566');
    act(() => { picker.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(steps()).toBe(1);
    undo();
    expect(light().emission.color).toBe('#ff9a3c');
  });

  it('commits a typed range on Enter, never leaving dim below bright', () => {
    const { light, steps } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    fireEvent.change(bright, { target: { value: '55' } });
    expect(light().emission.bright).toBe(20);
    fireEvent.keyDown(bright, { key: 'Enter' });
    expect(light().emission).toMatchObject({ bright: 55, dim: 55 });
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('55');
    expect(steps()).toBe(1);
    fireEvent.change(bright, { target: { value: 'far' } });
    fireEvent.blur(bright);
    expect(bright.value).toBe('55');
  });

  it('stops a typed range at the farthest a light may reach, and shows what it took', () => {
    const { light } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    fireEvent.change(bright, { target: { value: '1e9' } });
    fireEvent.keyDown(bright, { key: 'Enter' });
    // 8,192 px on the 70 px, 5 ft grid
    expect(light().emission).toMatchObject({ bright: 585, dim: 585 });
    expect(bright.value).toBe('585');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('585');
  });

  it('puts back the range when what was typed is not a number', () => {
    const { light, steps } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    for (const text of ['abc', '1,000', '']) {
      fireEvent.change(bright, { target: { value: text } });
      fireEvent.blur(bright);
      expect(bright.value).toBe('20');
    }
    expect(light().emission.bright).toBe(20);
    expect(steps()).toBe(0);
  });

  it('takes a whole slider drag as one undo step', () => {
    const { store, torch, light, steps, undo } = renderPopover();
    const slider = screen.getByRole('slider', { name: 'Intensity' }).closest('.slider-root')!;
    fireEvent.pointerDown(slider);
    act(() => {
      store.getState().updateLight(torch, { emission: { ...light().emission, intensity: 1.2 } });
      store.getState().updateLight(torch, { emission: { ...light().emission, intensity: 1.5 } });
    });
    fireEvent.pointerUp(window);
    expect(steps()).toBe(1);
    expect(screen.getByText('150 %')).toBeTruthy();
    undo();
    expect(light().emission.intensity).toBe(1);
  });

  it('raises a bright range of nothing again, which has no ring handle on the map', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 0 } }));
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    expect(bright.value).toBe('0');
    fireEvent.change(bright, { target: { value: '10' } });
    fireEvent.keyDown(bright, { key: 'Enter' });
    expect(light().emission.bright).toBe(10);
  });

  it('steps a range from the keyboard with its slider thumb', () => {
    const { light } = renderPopover();
    const bright = screen.getByRole('slider', { name: 'Bright range' });
    const dim = screen.getByRole('slider', { name: 'Dim range' });
    act(() => bright.focus());
    fireEvent.keyDown(bright, { key: 'ArrowRight' });
    expect(light().emission).toMatchObject({ bright: 21, dim: 40 });
    act(() => dim.focus());
    fireEvent.keyDown(dim, { key: 'ArrowLeft' });
    expect(light().emission).toMatchObject({ bright: 21, dim: 39 });
  });

  it('follows the light when the map changes it, as a ring drag does', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 12.5 } }));
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('12.5');
  });

  it('switches the light off and on', () => {
    const { light, steps } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(light().hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(light().hidden).toBe(false);
    expect(steps()).toBe(2);
  });

  it('deletes the light, and undo brings it back', () => {
    const { store, torch, steps, undo } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().objects.lights[torch]).toBeUndefined();
    expect(steps()).toBe(1);
    undo();
    expect(store.getState().objects.lights[torch]).toBeDefined();
  });

  it('shows another light in the same popover when that one is opened', () => {
    const { store, lantern } = renderPopover();
    const element = popover();
    act(() => store.getState().openLightPopover(lantern));
    expect(popover()).toBe(element);
    expect(screen.getByRole('button', { name: 'Lantern' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('60');
  });

  it('goes when the store closes it, taking no more input while it leaves', async () => {
    const { store } = renderPopover();
    const element = popover();
    act(() => store.getState().closeLightPopover());
    expect(element.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on Escape, which does not reach the map\'s shortcuts', () => {
    const { store, mapKeys } = renderPopover();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Torch' }), { key: 'Escape' });
    expect(store.getState().lightPopover).toBeNull();
    expect(mapKeys).not.toHaveBeenCalled();
  });

  it('keeps Tab, Space and the arrows to its controls, and lets undo through to the map', () => {
    const { mapKeys } = renderPopover();
    const chip = screen.getByRole('button', { name: 'Torch' });
    for (const key of ['Tab', ' ', 'Enter', 'ArrowLeft', 'ArrowDown']) fireEvent.keyDown(chip, { key });
    expect(mapKeys).not.toHaveBeenCalled();
    fireEvent.keyDown(chip, { key: 'z', metaKey: true });
    expect(mapKeys).toHaveBeenCalledTimes(1);
  });

  it('takes the focus when it opens and gives it back when it closes', () => {
    const { store, torch } = renderPopover(false);
    const map = screen.getByRole('button', { name: 'Map' });
    map.focus();
    act(() => store.getState().openLightPopover(torch));
    expect(document.activeElement).toBe(popover());
    act(() => store.getState().closeLightPopover());
    expect(document.activeElement).toBe(map);
  });
});
