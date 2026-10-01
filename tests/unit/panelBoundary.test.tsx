import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { MAP_UI_ROOT_OPTIONS, PanelBoundary } from '../../src/app/react/root/PanelBoundary';
import { ViewStoreProvider, useAtlasStore } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

/** A panel that cannot render the scene it is given, as the initiative tracker could not. */
const BrokenOnCave: React.FC = () => {
  const mapPath = useAtlasStore((state) => state.mapPath);
  if (mapPath === 'maps/cave.atlasmap') throw new TypeError("Cannot read properties of undefined (reading 'max')");
  return <p>Initiative</p>;
};

const unmounted = vi.fn();
const MapImage: React.FC = () => {
  React.useEffect(() => unmounted, []);
  return <p>Map image</p>;
};

let root: Root;
let container: HTMLElement;
let store: ViewAtlasStore;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The root is created here, not by Testing Library, to give it the map UI's options
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  unmounted.mockClear();
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  store = createViewAtlasStore(createInMemoryApp().app, 'panel-boundary-test');
  store.setState({ mapPath: 'maps/cave.atlasmap' });
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container, MAP_UI_ROOT_OPTIONS);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function show(panel: React.ReactNode): void {
  act(() => root.render(
    <ViewStoreProvider store={store}>
      <MapImage />
      {panel}
      <PanelBoundary name="Toolbar"><p>Toolbar</p></PanelBoundary>
    </ViewStoreProvider>,
  ));
}

describe('a map panel that fails to render', () => {
  it('takes the whole map UI down without a boundary', () => {
    store.setState({ mapPath: 'maps/tower.atlasmap' });
    show(<BrokenOnCave />);

    expect(() => act(() => store.getState().setMapPath('maps/cave.atlasmap'))).toThrow("reading 'max'");

    expect(container.textContent).toBe('');
    expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it('shows nothing itself while the map image and the other panels stay', () => {
    show(<PanelBoundary name="Initiative tracker"><BrokenOnCave /></PanelBoundary>);

    expect(container.textContent).toBe('Map imageToolbar');
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('logs the error once, naming the panel', () => {
    show(<PanelBoundary name="Initiative tracker"><BrokenOnCave /></PanelBoundary>);
    act(() => store.getState().setGridVisible(false));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe('[Atlas VTT] Initiative tracker could not be shown:');
    expect(logged.mock.calls[0]?.[1]).toBeInstanceOf(TypeError);
  });

  it('is shown again for the next scene', () => {
    show(<PanelBoundary name="Initiative tracker"><BrokenOnCave /></PanelBoundary>);

    act(() => store.getState().setMapPath('maps/tower.atlasmap'));

    expect(container.textContent).toBe('Map imageInitiativeToolbar');
    expect(unmounted).not.toHaveBeenCalled();
  });
});
