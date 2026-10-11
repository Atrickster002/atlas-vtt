import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { WorldMapField } from '../../src/app/react/components/collection-settings/WorldMapField';
import { worldMapCandidates } from '../../src/app/services/worldMap';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPresets } from '../mocks/memoryPresets';

const presets = new SystemPresetService(memoryPresets());
vi.mock('../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service: presets, presets: presets.list() }),
}));
vi.mock('../../src/app/services/collectionSystemSync', () => ({ syncCollectionSystem: vi.fn(async () => {}) }));

const REGION = 'atlas-vtt/assets/region.webp';
const REGION_THUMB = 'atlas-vtt/assets/thumbnails/region.webp';
const CAVE_MAP = 'atlas-vtt/collections/dungeon/scenes/Cave.atlasmap';
const CAVE_ART = 'atlas-vtt/assets/cave.webp';
const BARE_MAP = 'atlas-vtt/collections/dungeon/scenes/Bare.atlasmap';

const sceneFile = (background: string | null): string => JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, background, grid: null } });

const ASSETS = [
  { id: 'm1', type: 'map', name: 'The Realm', collection: 'dungeon', tags: [], mapFilePath: REGION, thumbnailPath: REGION_THUMB },
  { id: 's1', type: 'scene', name: 'Cave', collection: 'dungeon', tags: [], data: { mapPath: CAVE_MAP } },
  { id: 's2', type: 'scene', name: 'Bare', collection: 'dungeon', tags: [], data: { mapPath: BARE_MAP } },
] as unknown as Asset[];

function vault(): App {
  return createInMemoryApp({ files: {
    [REGION]: 'IMG', [REGION_THUMB]: 'THUMB', [CAVE_ART]: 'IMG',
    [CAVE_MAP]: sceneFile(CAVE_ART), 'atlas-vtt/collections/dungeon/scenes/Cave.thumb.jpg': 'JPG',
    [BARE_MAP]: sceneFile(null), 'atlas-vtt/collections/dungeon/scenes/Bare.thumb.jpg': 'JPG',
  } }).app;
}

/** The asset index as the dialog reads it; `saved` is what Save wrote. */
function library(settings: CollectionSettings): { saved: () => Partial<CollectionSettings> | undefined } {
  let written: Partial<CollectionSettings> | undefined;
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionSettings: () => settings,
    getCollections: async () => [{ id: 'dungeon', name: 'dungeon', version: 1, settings }],
    getAssets: async () => ASSETS,
    updateCollectionSettings: async (_id: string, next: Partial<CollectionSettings>) => { written = next; },
  } as unknown as AssetService);
  return { saved: () => written };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the images a world map can be chosen from', () => {
  it('are the artwork of the collection\'s maps and scenes, never a scene\'s thumbnail', async () => {
    const candidates = await worldMapCandidates(vault(), ASSETS);
    expect(candidates.map(({ name, sourcePath }) => ({ name, sourcePath }))).toEqual([
      { name: 'The Realm', sourcePath: REGION },
      { name: 'Cave', sourcePath: CAVE_ART },
    ]);
    expect(candidates[0]!.previewUrl).toBe(`app://vault/${REGION_THUMB}`);
  });
});

describe('the world map field', () => {
  function renderField(value: string | undefined, app = vault()): ReturnType<typeof vi.fn> {
    library({ conditions: [] });
    const onChange = vi.fn();
    render(<WorldMapField app={app} collectionId="dungeon" value={value} onChange={onChange} />);
    return onChange;
  }

  it('says what the map is for and offers the collection\'s artwork to choose from', async () => {
    const onChange = renderField(undefined);
    expect(screen.getByText('World map')).toBeTruthy();
    expect(screen.getByText('Players can open it at any time during online play.')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));
    const choices = await screen.findAllByRole('radio');
    expect(choices.map((choice) => choice.textContent)).toEqual(['The Realm', 'Cave']);
    expect(choices.every((choice) => choice.getAttribute('aria-checked') === 'false')).toBe(true);

    fireEvent.click(choices[1]!);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(CAVE_ART);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('shows the chosen image with its name, ticks it in the picker and takes the choice back', async () => {
    const onChange = renderField(REGION);
    await waitFor(() => expect(screen.getByText('The Realm')).toBeTruthy());
    expect(screen.getByText('atlas-vtt/assets')).toBeTruthy();
    expect(document.querySelector('.atlas-csm-world-map__thumb img')?.getAttribute('src')).toBe(`app://vault/${REGION_THUMB}`);

    fireEvent.click(screen.getByRole('button', { name: 'Change image' }));
    expect((await screen.findByRole('radio', { name: 'The Realm' })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove world map' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('says so when the image is gone from the vault, and still lets the GM remove or replace it', async () => {
    renderField('atlas-vtt/assets/gone.webp');
    expect(screen.getByText('gone.webp')).toBeTruthy();
    expect(screen.getByText('Image not found')).toBeTruthy();
    expect(document.querySelector('.atlas-csm-world-map__thumb img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove world map' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change image' })).toBeTruthy();
  });
});

describe('the world map in the collection settings', () => {
  function open(settings: CollectionSettings, onlinePlay: boolean): { saved: () => Partial<CollectionSettings> | undefined } {
    const app = vault();
    const atlasSettings = SettingsService.forApp(app) ?? new SettingsService(app);
    vi.spyOn(atlasSettings, 'isExperimentalOn').mockImplementation((id) => onlinePlay && id === 'onlinePlay');
    const index = library(settings);
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <CollectionSettingsModal isOpen onClose={() => {}} collectionId="dungeon" initialTab="grid" />
      </AtlasUIContext.Provider>,
    );
    return index;
  }

  const save = async (): Promise<void> => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
  };

  it('is chosen on the Grid & Measure tab while online play is switched on, and saved with the settings', async () => {
    const { saved } = open({ conditions: [] }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'The Realm' }));
    await save();
    expect(saved()).toMatchObject({ worldMap: REGION });
  });

  it('saves none, explicitly, once the GM removed it', async () => {
    const { saved } = open({ conditions: [], worldMap: REGION }, true);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove world map' }));
    await save();
    expect(saved()).toHaveProperty('worldMap', undefined);
  });

  it('is not offered while online play is off, and a save keeps the one the collection has', async () => {
    const { saved } = open({ conditions: [], worldMap: REGION }, false);
    expect(screen.queryByText('World map')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ worldMap: REGION });
  });
});
