import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { runUvttImport } from '../../src/app/import/uvtt/runUvttImport';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { mayCarryMapFile, useUvttImport, uvttFilesAmong, type ImportMaps } from '../../src/app/packages/components/asset-manager/hooks/useUvttImport';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../src/app/services/AssetService';

vi.mock('../../src/app/import/uvtt/runUvttImport', () => ({ runUvttImport: vi.fn() }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({ TokenPreviewCard: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => {
  const converted = { image: new Blob(), thumbnail: null, preview: null, sourcePreview: null };
  return { convertForPreview: async () => converted, cropTokenImage: async () => converted, optimizeUpload: async () => converted };
});

const crypt = new File(['{}'], 'Crypt.dd2vtt');
const keep = new File(['{}'], 'Keep.UVTT');
const cave = new File(['art'], 'Cave.png', { type: 'image/png' });

const imported = (name: string): UvttImported => ({
  ok: true, name, scenePath: `atlas-vtt/collections/Dungeons/scenes/${name}.atlasmap`, counts: { walls: 1, doors: 0, lights: 0 }, lightsOff: false,
});

const openFile = vi.fn(async (_file: TFile): Promise<void> => {});
const app = {
  vault: { getFileByPath: vi.fn((path: string): TFile | null => Object.assign(new TFile(), { path })), getAbstractFileByPath: vi.fn(() => null) },
  workspace: { getLeaf: () => ({ openFile }), trigger: vi.fn() },
} as unknown as App;
const assets = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCollections: vi.fn().mockResolvedValue([{ id: 'Dungeons', name: 'Dungeons' }]),
  getAllTags: vi.fn().mockResolvedValue([]),
} as unknown as AssetService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runUvttImport).mockResolvedValue([]);
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  URL.createObjectURL = vi.fn(() => 'blob:art');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('telling map files from other files', () => {
  it('picks the Universal VTT files by their names', () => {
    expect(uvttFilesAmong([cave, crypt, keep])).toEqual([crypt, keep]);
    expect(uvttFilesAmong([cave])).toEqual([]);
  });

  it.each([
    ['a file of a type the browser does not know', [{ kind: 'file', type: '' }], true],
    ['a map file among images', [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: '' }], true],
    ['only images', [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: 'image/webp' }], false],
    ['an asset dragged inside the manager', [{ kind: 'string', type: 'text/plain' }], false],
    ['nothing', [], false],
  ])('a drag with %s may carry a map file: %s', (_label, items, expected) => {
    expect(mayCarryMapFile({ items: items as unknown as DataTransferItemList })).toBe(expected);
  });
});

describe('importing maps in the asset manager', () => {
  const dragOf = (items: Array<{ kind: string; type: string }>, files: File[] = []): { preventDefault: ReturnType<typeof vi.fn>; dataTransfer: { items: unknown; files: File[]; dropEffect: string } } => ({
    preventDefault: vi.fn(),
    dataTransfer: { items, files, dropEffect: 'none' },
  });
  const handlers = (onSceneOpened = vi.fn()): { onDragOver: (event: unknown) => void; onDrop: (event: unknown) => void } => {
    const { result } = renderHook(() => useUvttImport(app, assets, onSceneOpened));
    return result.current.dropHandlers('Dungeons') as { onDragOver: (event: unknown) => void; onDrop: (event: unknown) => void };
  };

  it('takes a dragged map file as a copy and lets a dragged image pass', () => {
    const { onDragOver } = handlers();
    const map = dragOf([{ kind: 'file', type: '' }]);
    const image = dragOf([{ kind: 'file', type: 'image/png' }]);

    onDragOver(map);
    onDragOver(image);

    expect(map.preventDefault).toHaveBeenCalled();
    expect(map.dataTransfer.dropEffect).toBe('copy');
    expect(image.preventDefault).not.toHaveBeenCalled();
  });

  it('imports the dropped map files into the collection and opens the last scene', async () => {
    const onSceneOpened = vi.fn();
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt'), imported('Keep')]);
    const drop = dragOf([], [crypt, cave, keep]);

    handlers(onSceneOpened).onDrop(drop);

    expect(drop.preventDefault).toHaveBeenCalled();
    expect(runUvttImport).toHaveBeenCalledWith(app, assets, [crypt, keep], 'Dungeons');
    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile.mock.calls[0]![0].path).toBe('atlas-vtt/collections/Dungeons/scenes/Keep.atlasmap');
  });

  it('leaves a drop without a map file alone', () => {
    const drop = dragOf([], [cave]);

    handlers().onDrop(drop);

    expect(drop.preventDefault).not.toHaveBeenCalled();
    expect(runUvttImport).not.toHaveBeenCalled();
  });

  it('opens nothing and stays open when no file arrived', async () => {
    const onSceneOpened = vi.fn();
    const { result } = renderHook(() => useUvttImport(app, assets, onSceneOpened));

    await result.current.importMaps([crypt], 'Dungeons');

    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
  });

  it('only adds the scenes where it is asked to stay', async () => {
    const onSceneOpened = vi.fn();
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt')]);
    const { result } = renderHook(() => useUvttImport(app, assets, onSceneOpened));

    await result.current.importMaps([crypt], 'Dungeons', () => true);

    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
  });

  it('stays open and says so when the scene cannot be opened', async () => {
    const onSceneOpened = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt')]);
    openFile.mockRejectedValueOnce(new Error('No leaf'));
    const { result } = renderHook(() => useUvttImport(app, assets, onSceneOpened));

    await expect(result.current.importMaps([crypt], 'Dungeons')).resolves.toBeUndefined();

    expect(onSceneOpened).not.toHaveBeenCalled();
  });
});

describe('adding maps with the map creator', () => {
  const ui = { app } as unknown as AtlasUIContextValue;
  const mount = (child: React.ReactNode): void => { render(<AtlasUIContext.Provider value={ui}>{child}</AtlasUIContext.Provider>); };
  const picker = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[type=file]')!;
  const pick = (files: File[]): void => { fireEvent.change(picker(), { target: { files } }); };

  it('offers Universal VTT files beside images', () => {
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={vi.fn<ImportMaps>()} />);

    expect(picker().accept).toBe('image/*,.dd2vtt,.uvtt,.df2vtt');
    expect(screen.getByText('PNG · JPG · WebP · Universal VTT')).toBeTruthy();
  });

  it('offers only images for tokens', () => {
    mount(<TokenCreator isOpen onClose={() => {}} mode="token" selectedCollection="Dungeons" />);

    expect(picker().accept).toBe('image/*');
    expect(screen.getByText('PNG · JPG · WebP')).toBeTruthy();
  });

  it('imports a picked map file into the chosen collection and lets its scene open', async () => {
    const onImportMaps = vi.fn<ImportMaps>(async () => {});
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={onImportMaps} />);

    pick([crypt]);

    expect(onImportMaps).toHaveBeenCalledWith([crypt], 'Dungeons', expect.any(Function));
    expect(onImportMaps.mock.calls[0]![2]!()).toBe(false);
    expect(screen.getByText('No maps yet')).toBeTruthy();
  });

  it('keeps images as previews and stays open for them', async () => {
    const onImportMaps = vi.fn<ImportMaps>(async () => {});
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={onImportMaps} />);

    pick([cave, crypt]);

    expect(onImportMaps).toHaveBeenCalledWith([crypt], 'Dungeons', expect.any(Function));
    await waitFor(() => expect(screen.getByText('1 map')).toBeTruthy());
    expect(onImportMaps.mock.calls[0]![2]!()).toBe(true);
  });
});
