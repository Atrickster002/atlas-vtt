import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { AlignmentResult } from '../../src/app/pixi/gridAlignmentMath';
import type { MapGray } from '../../src/app/pixi/gridDetection/detectGrid';
import { NO_STRETCH, readMapStretch, type MapStretch } from '../../src/app/grid/mapStretch';
import type { GridState } from '../../src/app/types/gridTypes';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';

const detectGridFromMapImage = vi.fn<() => Promise<AlignmentResult | null>>();
const snapGridToMapGray = vi.fn<(gray: MapGray, candidates: AlignmentResult[]) => AlignmentResult | null>();
vi.mock('../../src/app/pixi/gridDetection/detectGrid', () => ({
  pictureOf: () => ({ size: { width: 1000, height: 1000 }, bitmap: () => Promise.resolve(null) }),
}));
// The worker's side of a detection: what it finds, without its edges on the map's lines.
vi.mock('../../src/app/pixi/gridDetection/gridDetectionService', () => ({
  detectGridOfMap: async () => ({ result: await detectGridFromMapImage(), hits: null }),
  detectGridInGray: (gray: MapGray, options: { candidates: AlignmentResult[] }) => Promise.resolve({ result: snapGridToMapGray(gray, options.candidates), hits: null }),
}));

// The freehand preview under the pointer is PIXI's to draw: here only where a click places the grid matters.
vi.mock('../../src/app/pixi/FreehandGridPreview', () => ({
  freehandCellSize: (scale: number) => 80 / scale,
  FreehandGridPreview: class {
    view = {};
    showAt(): void {}
    hide(): void {}
    setGridType(): void {}
    destroy(): void {}
  },
}));

import { GridAlignmentOverlay } from '../../src/app/react/components/GridAlignmentOverlay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';

const SCENE_GRID: GridState = { enabled: true, visible: false, type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

type Move = (point: { x: number; y: number }) => { x: number; y: number };

interface SceneStore {
  grid: GridState | null;
  mapPath: string;
  isMapLoading: boolean;
  /** Where the alignment that was applied took a point of the map; null where the map stayed as it was. */
  moved: { x: number; y: number } | null;
  setGrid: (grid: GridState) => void;
  alignGrid: (grid: GridState, move?: Move) => void;
}

interface Harness {
  store: ReturnType<typeof create<SceneStore>>;
  gridSystem: { updateOptions: ReturnType<typeof vi.fn>; setAlignmentMode: ReturnType<typeof vi.fn> };
  stretches: MapStretch[];
  canvas: HTMLCanvasElement;
  onClose: ReturnType<typeof vi.fn>;
}

/** The alignment panel over a 1000 × 1000 map whose canvas shows the world one to one from its corner. */
function open(grid: GridState = SCENE_GRID): Harness {
  const store = create<SceneStore>((set) => ({
    grid,
    mapPath: 'scene.atlasmap',
    isMapLoading: false,
    moved: null,
    setGrid: (next) => set({ grid: next }),
    alignGrid: (next, move) => set({ grid: next, moved: move ? move({ x: 100, y: 200 }) : null }),
  }));
  const stretches: MapStretch[] = [];
  let stretch = readMapStretch(grid.mapStretch);
  const mapImage = {
    get worldRect() { return { x: 0, y: 0, width: 1000 * stretch.x, height: 1000 * stretch.y }; },
    imageSize: { width: 1000, height: 1000 },
    get mapStretch() { return stretch; },
    setStretch: (next: MapStretch) => { stretch = next; stretches.push(next); },
    overview: () => Promise.resolve(null),
  };
  const canvas = document.body.createEl('canvas');
  const gridSystem = { updateOptions: vi.fn(), setAlignmentMode: vi.fn() };
  const viewport = { toWorld: (x: number, y: number) => ({ x, y }), scale: { x: 1, set: vi.fn() }, center: { x: 500, y: 500 }, moveCenter: vi.fn(), emit: vi.fn(), addChild: vi.fn(), on: vi.fn(), off: vi.fn() };
  const renderer = {
    getViewportInstance: () => viewport,
    getGridSystem: () => gridSystem,
    getCanvasElement: () => canvas,
    getMapImage: () => mapImage,
    cancelGridAlignment: () => mapImage.setStretch(readMapStretch(store.getState().grid?.mapStretch)),
    applyGridAlignment: vi.fn(),
    // No WebGL here: detections show their answers without the scan over the map.
    getAppInstance: () => ({ renderer: { name: 'canvas' } }),
    addDmScreenOverlay: () => () => undefined,
  };
  const view = { atlasStore: store, renderer } as unknown as AtlasView;
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ view } as AtlasUIContextValue}>
      <GridAlignmentOverlay onClose={onClose} />
    </AtlasUIContext.Provider>,
  );
  return { store, gridSystem, stretches, canvas, onClose };
}

/** The Apply button: there from the start, to be pressed once there is a grid. */
function applyButton(): HTMLButtonElement {
  return screen.getByText('Apply').closest('button') as HTMLButtonElement;
}

/** Resolves once the panel has a grid to apply. */
function gridToApply(): Promise<void> {
  return waitFor(() => expect(applyButton().disabled).toBe(false));
}

/** A short left click on the map at a world point. */
function clickMap(canvas: HTMLCanvasElement, x: number, y: number): void {
  act(() => {
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  });
}

const lastPreview = (gridSystem: Harness['gridSystem']): unknown => gridSystem.updateOptions.mock.calls.at(-1)?.[0];

beforeEach(() => {
  detectGridFromMapImage.mockReset();
  snapGridToMapGray.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.empty();
});

describe('GridAlignmentOverlay', () => {
  it('previews a detected grid on the map as it stretches it, and applies both together', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-horizontal', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
    const { store, gridSystem, stretches, onClose } = open();

    fireEvent.click(screen.getByText('Detect grid'));
    await gridToApply();

    expect(stretches.at(-1)).toEqual({ x: 1.048, y: 1 });
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'hex-horizontal', size: 35.3, offsetX: 4, offsetY: 9, isAligning: true });
    // A detected grid is a preview like any other: nothing asks for a measurement, and no key moves it.
    expect(screen.queryByText(/Click a corner of a hex/)).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(lastPreview(gridSystem)).toMatchObject({ offsetX: 4, offsetY: 9 });

    fireEvent.click(screen.getByText('Apply'));

    expect(store.getState().grid).toMatchObject({ type: 'hex-horizontal', size: 35.3, offsetX: 4, offsetY: 9, visible: true, mapStretch: { x: 1.048, y: 1 } });
    // What stands on the map goes with it: a point keeps its place on the image.
    expect(store.getState().moved!.x).toBeCloseTo(104.8, 6);
    expect(store.getState().moved!.y).toBeCloseTo(200, 6);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves nothing where the applied alignment draws the map as the scene has it', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 3, offsetY: 5, confidence: 0.9 });
    const { store } = open();
    fireEvent.click(screen.getByText('Detect grid'));
    await gridToApply();

    fireEvent.click(screen.getByText('Apply'));

    expect(store.getState().grid).toMatchObject({ type: 'square', size: 64 });
    expect(store.getState().moved).toBeNull();
  });

  it('ends the alignment when the view opens another scene, with the map put back', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 0, offsetY: 0, confidence: 0.6, mapStretch: { x: 1, y: 1.1 } });
    const { store, stretches, onClose } = open();
    fireEvent.click(screen.getByText('Detect grid'));
    await gridToApply();

    act(() => store.setState({ isMapLoading: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    expect(store.getState().grid).toBe(SCENE_GRID);
  });

  it('shows nothing of a detection that answers after the GM went on by hand', async () => {
    let answer: (found: unknown) => void = () => undefined;
    detectGridFromMapImage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { stretches } = open();
    fireEvent.click(screen.getByText('Detect grid'));

    fireEvent.click(screen.getByText('Measure'));
    await act(async () => {
      answer({ gridType: 'hex-horizontal', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
      await Promise.resolve();
    });

    expect(applyButton().disabled).toBe(true);
    expect(stretches.every((stretch) => stretch.x === 1 && stretch.y === 1)).toBe(true);
    // The grid can be looked for again, and the grid type is still the scene's: the answer nobody waited for set nothing.
    expect(screen.getByText('Detect grid')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Pointy/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('puts the map back as the scene has it when a previewed stretch is cancelled', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 0, offsetY: 0, confidence: 0.6, mapStretch: { x: 1, y: 1.1 } });
    const { store, stretches } = open();
    fireEvent.click(screen.getByText('Detect grid'));
    await gridToApply();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    expect(store.getState().grid).toBe(SCENE_GRID);
  });

  it('goes back from a detected grid to measuring when a tab is chosen', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-horizontal', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
    const { stretches } = open();
    fireEvent.click(screen.getByText('Detect grid'));
    await gridToApply();

    fireEvent.click(screen.getByText('Measure'));

    await screen.findByText('Click a corner of a hex.');
    // The panel's grid type is the detected one from here on.
    expect(screen.getByRole('radio', { name: /Flat/ }).getAttribute('aria-checked')).toBe('true');
    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    // Nothing to apply until something is measured.
    expect(applyButton().disabled).toBe(true);
  });

  it('fits one measurement to the map\'s lines: the chosen grid type first, the lines\' answer previewed', async () => {
    snapGridToMapGray.mockReturnValue({ gridType: 'hex-vertical', cellSize: 35.37, offsetX: 1, offsetY: 2, confidence: 0.5, mapStretch: { x: 1.048, y: 1 } });
    const { store, gridSystem, canvas } = open();
    fireEvent.click(screen.getByText('Measure'));

    // The corners to the left and right of a pointy hex 34 px wide: once read as the edge of a huge flat hex.
    clickMap(canvas, 100, 100);
    clickMap(canvas, 134, 100);

    await gridToApply();
    const candidates = snapGridToMapGray.mock.calls[0]![1];
    expect(candidates[0]).toMatchObject({ gridType: 'hex-vertical', cellSize: 34 });
    expect(candidates.map((c) => c.gridType)).toContain('hex-horizontal');
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'hex-vertical', size: 35.37 });

    fireEvent.click(screen.getByText('Apply'));
    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', size: 35.37, mapStretch: { x: 1.048, y: 1 } });
  });

  it('keeps the grid as measured where the lines answer nothing, after all four measurements', async () => {
    snapGridToMapGray.mockReturnValue(null);
    const { gridSystem, canvas } = open({ ...SCENE_GRID, type: 'square' });
    fireEvent.click(screen.getByText('Measure'));

    for (const [x, y] of [[100, 100], [600, 100], [100, 600], [600, 600]]) {
      clickMap(canvas, x!, y!);
      clickMap(canvas, x! + 50, y! + 3);
      // The lines are asked after the first measurement; the next waits for their answer.
      await waitFor(() => expect(screen.queryByText("Fitting to the map's lines…")).toBeNull());
    }

    await gridToApply();
    expect(snapGridToMapGray).toHaveBeenCalledTimes(2);
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'square', size: 50, offsetX: 0, offsetY: 0 });
  });

  it('starts a way of aligning anew when it is chosen again', async () => {
    snapGridToMapGray.mockReturnValue({ gridType: 'hex-vertical', cellSize: 35.37, offsetX: 1, offsetY: 2, confidence: 0.5 });
    const { canvas } = open();
    fireEvent.click(screen.getByText('Measure'));
    clickMap(canvas, 100, 100);
    clickMap(canvas, 134, 100);
    await gridToApply();

    // No button to start over: the way already chosen is the way back to its beginning.
    fireEvent.click(screen.getByText('Measure'));
    await screen.findByText('Click a corner of a hex.');
    expect(applyButton().disabled).toBe(true);
  });

  it('opens without a way of aligning by hand chosen: the map is left as it is until the GM measures or places', () => {
    const { gridSystem } = open();
    // The two ways are offered and neither is taken: no grid type to pick, nothing to click on the map, nothing to apply.
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    expect(screen.queryByText(/Click a corner/)).toBeNull();
    expect(applyButton().disabled).toBe(true);
    expect(gridSystem.updateOptions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Measure'));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Measure' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Click a corner of a hex.')).toBeTruthy();
  });

  it('shows only the search while a detection runs, and opens measuring where the map has no grid to find', async () => {
    let answer: (found: AlignmentResult | null) => void = () => undefined;
    detectGridFromMapImage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    open();
    fireEvent.click(screen.getByText('Detect grid'));

    // The words of the search stand where its button was; the ways by hand stay, to go on by hand at any time.
    await screen.findByText('Looking at the map…');
    expect(screen.queryByText('Detect grid')).toBeNull();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);

    // No grid: said in a notice beside the panel, and measuring opens. The panel gets no words of its own.
    await act(async () => { answer(null); });
    await screen.findByText('Click a corner of a hex.');
    expect(screen.queryByText(/No grid found/)).toBeNull();
  });

  it('keeps a grid placed freehand exactly as it was placed: the map\'s lines are never asked', async () => {
    // A map with a printed grid of another size, which a fit would snap the placed grid to.
    snapGridToMapGray.mockReturnValue({ gridType: 'hex-vertical', cellSize: 35.37, offsetX: 1, offsetY: 2, confidence: 0.9 });
    const { store, gridSystem, canvas } = open();
    fireEvent.click(screen.getByText('Freehand'));

    clickMap(canvas, 300, 400);
    await gridToApply();
    // The zoom gives the cell its size (80 px on screen at a scale of 1) and the click its place.
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'hex-vertical', size: 80, enabled: true });
    expect(snapGridToMapGray).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Apply'));
    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', size: 80, visible: true });
    expect(snapGridToMapGray).not.toHaveBeenCalled();
  });
});

