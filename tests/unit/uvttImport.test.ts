// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importUvttFile, type UvttImportDeps, type UvttImportResult, type UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { parseUvtt } from '../../src/app/import/uvtt/parseUvtt';
import { uvttImportSummary } from '../../src/app/import/uvtt/runUvttImport';
import { uvttToScene } from '../../src/app/import/uvtt/uvttToScene';
import { UVTT_LIMITS } from '../../src/app/import/uvtt/uvttTypes';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { readSceneLighting } from '../../src/app/lighting/sceneLightingOptions';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { createAtlasStorage, migrateMapFile, parseSceneFile, type GridState } from '../../src/app/services/MapPersistence';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { base64Of, cryptFile, cryptSetting, cryptWith, pngHeader } from '../fixtures/uvttFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const COLLECTION = 'Dungeons';
const SCENES = `atlas-vtt/collections/${COLLECTION}/scenes`;
const FEET = { unitType: 'feet', unitDistance: 5 } as const;

interface Bench {
  vault: InMemoryApp;
  assets: AssetService;
  deps: UvttImportDeps;
  convertImage: ReturnType<typeof vi.fn<UvttImportDeps['convertImage']>>;
}

/** What the image workers return for an image that fits a map: the image itself and a thumbnail. */
const converted = (image: Blob): ProcessedImage => ({ image, thumbnail: new Blob(['THUMB']), preview: null, sourcePreview: null });

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  const convertImage = vi.fn<UvttImportDeps['convertImage']>(async (image) => converted(image));
  const thumbnails = new AssetThumbnailService(vault.app, assets, async () => new ArrayBuffer(0));
  return { vault, assets, convertImage, deps: { app: vault.app, assetService: assets, convertImage, thumbnails } };
}

const uvttFile = (content: unknown, name = 'Crypt.dd2vtt'): File => new File([typeof content === 'string' ? content : JSON.stringify(content)], name);

function arrived(result: UvttImportResult): UvttImported {
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result;
}

function problemOf(result: UvttImportResult): string {
  if (result.ok) throw new Error('The file was imported');
  return result.problem;
}

interface SceneState {
  background: string;
  grid: GridState;
  objects: { walls: Record<string, unknown>; lights: Record<string, { emission: { bright: number; dim: number }; hidden?: boolean }> };
  lighting: SceneLighting;
  tokenSettings: Record<string, unknown>;
}

const sceneState = ({ vault }: Bench, path: string): SceneState => (JSON.parse(vault.files.get(path)!) as { state: SceneState }).state;
const filesOf = ({ vault }: Bench): string[] => [...vault.files.keys()].sort();
const recordsOf = async ({ assets }: Bench): Promise<Asset[]> => assets.getAssets(COLLECTION);

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('importing a Universal VTT file', () => {
  it('adds a map and a scene of the same name, with the image, its thumbnail and the file\'s walls, doors and lights', async () => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(result).toMatchObject({ name: 'Crypt', scenePath: `${SCENES}/Crypt.atlasmap`, counts: { walls: 10, doors: 1, lights: 1 }, lightsOff: false });
    const records = await recordsOf(b);
    const map = records.find((record) => record.type === 'map');
    const scene = records.find((record) => record.type === 'scene');
    expect(records).toHaveLength(2);
    expect(map).toMatchObject({ name: 'Crypt', tags: [], collection: COLLECTION });
    expect(scene).toMatchObject({ name: 'Crypt', tags: [], collection: COLLECTION, data: { mapPath: result.scenePath } });
    if (map?.type !== 'map' || scene?.type !== 'scene') throw new Error('Records are missing');

    expect(map.mapFilePath).toMatch(/^atlas-vtt\/assets\/Crypt_.+\.webp$/);
    expect(b.vault.files.has(map.mapFilePath)).toBe(true);
    expect(b.vault.files.get(map.thumbnailPath!)).toBe('THUMB');
    expect(JSON.parse(b.vault.files.get(map.filePath!)!)).toMatchObject({ id: map.id, name: 'Crypt', mapFilePath: map.mapFilePath });
    expect(JSON.parse(b.vault.files.get(scene.filePath!)!)).toEqual({ mapPath: result.scenePath });

    const state = sceneState(b, result.scenePath);
    expect(state.background).toBe(map.mapFilePath);
    expect(state.lighting).toEqual({ enabled: true, ambient: 0.5 });
    expect(Object.keys(state.objects.walls)).toHaveLength(11);
    expect(Object.keys(state.objects.lights)).toHaveLength(1);
  });

  it('hands the workers the image as its own bytes say it is', async () => {
    const b = await bench();

    await importUvttFile(b.deps, uvttFile(cryptSetting('image', `data:image/webp;base64,${base64Of(pngHeader(1000, 800))}`)), COLLECTION);

    const source = b.convertImage.mock.calls[0]![0];
    expect(source.type).toBe('image/png');
    expect([...new Uint8Array(await source.arrayBuffer())]).toEqual([...pngHeader(1000, 800)]);
  });

  it('writes a scene whose grid is the file\'s, with nothing left to detect', async () => {
    const b = await bench();

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const { grid } = sceneState(b, scenePath);
    expect(grid).toMatchObject({ enabled: true, visible: true, type: 'square', size: 100, offsetX: 0, offsetY: 0 });
    expect(grid).not.toHaveProperty('autoDetect');
  });

  it('survives the checks a scene passes when it is opened, with every wall and light in place', async () => {
    const b = await bench();
    const parsed = parseUvtt(JSON.stringify(cryptFile()));
    if (!parsed.ok) throw new Error(parsed.problem);
    const expected = uvttToScene(parsed.map, { cellSize: 100, unit: FEET });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const loaded = migrateMapFile(parseSceneFile(b.vault.files.get(scenePath)!).state);
    expect(loaded.objects.walls).toEqual(expected.walls);
    expect(loaded.objects.lights).toEqual(expected.lights);
    expect(loaded.grid).toMatchObject(expected.grid);
    expect(loaded.objects).toMatchObject({ tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} });

    const storage = createAtlasStorage<{ mapPath: string }, SceneState>(b.vault.app, { getState: () => ({ mapPath: scenePath }) });
    const stored = await storage.getItem('atlas');
    expect(stored?.version).toBe(4);
    expect(stored?.state.objects.walls).toEqual(expected.walls);
    expect(stored?.state.objects.lights).toEqual(expected.lights);
    expect(readSceneLighting(stored?.state.lighting)).toEqual({ enabled: true, ambient: 0.5 });
  });

  it.each<[string, CollectionGridDefaults, number, number, Partial<GridState>]>([
    ['feet', { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, 15, 30, { unitType: 'feet', unitDistance: 5, measurementType: 'units' }],
    ['metres', { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' }, 4.5, 9, { unitType: 'meters', unitDistance: 1.5, measurementType: 'units' }],
    ['range bands', { unitType: 'feet', unitDistance: 5, measurementMode: 'abstract', abstractRangeBands: [{ name: 'Close', maxSquares: 6 }] }, 15, 30, { unitType: 'feet', unitDistance: 5, measurementType: 'abstract' }],
    ['range bands of ten feet a square', { unitType: 'feet', unitDistance: 10, measurementMode: 'abstract' }, 30, 60, { unitDistance: 10, measurementType: 'abstract' }],
  ])('gives lights their ranges in what a collection measuring in %s counts', async (_label, gridDefaults, bright, dim, grid) => {
    const b = await bench();
    await b.assets.updateCollectionSettings(COLLECTION, { gridDefaults });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const state = sceneState(b, scenePath);
    expect(state.objects.lights.light_uvtt_1!.emission).toMatchObject({ bright, dim });
    expect(state.grid).toMatchObject(grid);
  });

  it('places walls on the image as it is saved when a large image was scaled down', async () => {
    const b = await bench();
    const file = cryptWith((crypt) => {
      crypt.resolution = { map_origin: { x: 0, y: 0 }, map_size: { x: 40, y: 30 }, pixels_per_grid: 256 };
      crypt.image = base64Of(pngHeader(10240, 7680));
    });
    const scaledDown = { from: { width: 10240, height: 7680 }, to: { width: 8192, height: 6144 } };
    b.convertImage.mockImplementation(async () => ({ ...converted(new Blob([pngHeader(8192, 6144)])), scaledDown }));

    const result = arrived(await importUvttFile(b.deps, uvttFile(file), COLLECTION));

    const state = sceneState(b, result.scenePath);
    expect(state.grid.size).toBe(204.8);
    expect(state.objects.walls.wall_uvtt_1).toMatchObject({ p1: { x: 204.8, y: 204.8 }, p2: { x: 9 * 204.8, y: 204.8 } });
    expect(result.scaledDown).toEqual(scaledDown);
  });

  it('imports baked lights switched off, on a scene in daylight', async () => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptSetting('environment.baked_lighting', true)), COLLECTION));

    const state = sceneState(b, result.scenePath);
    expect(result.lightsOff).toBe(true);
    expect(state.objects.lights.light_uvtt_1!.hidden).toBe(true);
    expect(state.lighting).toEqual({ enabled: true, ambient: 1 });
  });

  it('numbers the name when a scene already carries it', async () => {
    const b = await bench();

    const first = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const second = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const third = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect([first.name, second.name, third.name]).toEqual(['Crypt', 'Crypt 2', 'Crypt 3']);
    expect(third.scenePath).toBe(`${SCENES}/Crypt 3.atlasmap`);
    expect((await recordsOf(b)).filter((record) => record.type === 'scene').map((record) => record.name).sort()).toEqual(['Crypt', 'Crypt 2', 'Crypt 3']);
  });

  it('writes its files and records as one step, so the vault check finds nothing to add or drop', async () => {
    const b = await bench();
    let locked = false;
    const runExclusive = b.assets.runExclusive.bind(b.assets);
    vi.spyOn(b.assets, 'runExclusive').mockImplementation(async (task) => {
      locked = true;
      try { return await runExclusive(task); } finally { locked = false; }
    });
    const unlockedWrites: string[] = [];
    let lockedWrites = 0;
    type FileWrite = ReturnType<typeof vi.fn<(path: string, content: unknown) => Promise<unknown>>>;
    for (const write of [b.vault.app.vault.create, b.vault.app.vault.createBinary] as unknown[] as FileWrite[]) {
      const original = write.getMockImplementation()!;
      write.mockImplementation(async (path, content) => {
        if (locked) lockedWrites++;
        else unlockedWrites.push(path);
        return original(path, content);
      });
    }

    arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const before = await recordsOf(b);
    await b.assets.reconcileWithVault();

    // The image, the scene file and the two record files
    expect(lockedWrites).toBeGreaterThanOrEqual(4);
    expect(unlockedWrites).toEqual([]);
    expect(await recordsOf(b)).toEqual(before);
    expect(before.map((record) => record.type).sort()).toEqual(['map', 'scene']);
  });

  it('gives a new scene of the collection its token settings', async () => {
    const b = await bench();
    await b.assets.updateCollectionSettings(COLLECTION, { defaultWidgets: { hpBar: true, stressBar: false } });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(sceneState(b, scenePath).tokenSettings).toMatchObject({ showHPBars: true, showStressBars: false, showNameplates: false });
  });
});

describe('a Universal VTT file that is refused', () => {
  const refusals: Array<[string, () => File, string]> = [
    ['is larger than 50 MB', () => new File([new Uint8Array(UVTT_LIMITS.fileBytes + 1)], 'huge.dd2vtt'), 'The file is larger than 50 MB.'],
    ['is not JSON', () => uvttFile('PK\x03\x04 not a map'), 'The file is not a Universal VTT map (it is not valid JSON).'],
    ['has a wall point that is not a number', () => uvttFile(cryptSetting('line_of_sight.0.0.x', 'a')), 'Point 1 of wall line 1 (x) is missing or not a number.'],
    ['holds an image that is no image', () => uvttFile(cryptSetting('image', base64Of(new TextEncoder().encode('MZ executable')))), 'The map image in the file is not a PNG, WebP or JPEG image.'],
    ['holds an image whose header ends early', () => uvttFile(cryptSetting('image', base64Of(pngHeader(1000, 800).slice(0, 12)))), 'The map image in the file could not be read.'],
    ['holds an image of another shape than the map', () => uvttFile(cryptSetting('image', base64Of(pngHeader(1000, 1000)))), 'The map image is 1000 × 1000 pixels, which does not fit a map of 10 × 8 squares.'],
    ['holds an image too large to decode', () => uvttFile(cryptSetting('image', base64Of(pngHeader(40_000, 32_000)))), 'The map image is larger than 16,384 pixels on a side.'],
  ];

  it.each(refusals)('when it %s, changes nothing', async (_label, file, problem) => {
    const b = await bench();
    const before = filesOf(b);

    expect(problemOf(await importUvttFile(b.deps, file(), COLLECTION))).toBe(problem);

    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
    expect(b.convertImage).not.toHaveBeenCalled();
  });

  it('when the collection is gone, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), 'Gone'))).toBe('The collection no longer exists. Choose another collection and try again.');

    expect(filesOf(b)).toEqual(before);
  });

  it('when the workers cannot decode its image, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    b.convertImage.mockRejectedValue(new Error('The source image could not be decoded.'));

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The map image in the file could not be read.');

    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
  });

  it('when the decoded image is not the size its header stated, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    b.convertImage.mockImplementation(async () => converted(new Blob([pngHeader(640, 640)])));

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The map image is 640 × 640 pixels, which does not fit a map of 10 × 8 squares.');

    expect(filesOf(b)).toEqual(before);
  });

  it('never throws, even when the file cannot be read at all', async () => {
    const b = await bench();
    const file = uvttFile(cryptFile());
    file.text = (): Promise<string> => Promise.reject(new Error('NotReadableError'));

    expect(problemOf(await importUvttFile(b.deps, file, COLLECTION))).toBe('The file could not be imported.');
  });
});

describe('an import that fails half way', () => {
  type Write = (path: string, content: string) => Promise<unknown>;

  /** Runs an import in which every write to a path matching `failing` is refused, then lets writes through again. */
  async function failingAt(b: Bench, failing: RegExp, through: 'create' | 'adapter'): Promise<UvttImportResult> {
    const { vault } = b.vault.app;
    const mock = vi.mocked<Write>(through === 'create' ? vault.create : vault.adapter.write);
    const write = mock.getMockImplementation()!;
    let refused = 0;
    mock.mockImplementation(async (path, content) => {
      if (!failing.test(path)) return write(path, content);
      refused++;
      throw new Error('EIO: i/o error');
    });
    try {
      return await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION);
    } finally {
      mock.mockImplementation(write);
      expect(refused).toBe(1);
    }
  }

  it.each<[string, RegExp, 'create' | 'adapter']>([
    ['the scene file cannot be written', /\.atlasmap$/, 'create'],
    ['the map\'s record file cannot be written', /\/maps\/map-.+\.json$/, 'create'],
    ['the scene\'s record file cannot be written', /\/scenes\/scene-.+\.json$/, 'create'],
    ['the asset index cannot be saved', /assets-metadata\.json$/, 'adapter'],
  ])('leaves no file and no record when %s', async (_label, failing, through) => {
    const b = await bench();
    const before = filesOf(b);
    const index = b.vault.files.get([...b.vault.files.keys()].find((path) => path.endsWith('assets-metadata.json'))!);

    const result = await failingAt(b, failing, through);

    expect(problemOf(result)).toBe('The map could not be saved. Nothing was added.');
    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
    await b.assets.refreshMetadata();
    expect(await recordsOf(b)).toEqual([]);
    expect(b.vault.files.get([...b.vault.files.keys()].find((path) => path.endsWith('assets-metadata.json'))!)).toBe(index);
  });

  it('leaves the vault ready for the same import to succeed afterwards', async () => {
    const b = await bench();

    await failingAt(b, /assets-metadata\.json$/, 'adapter');
    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(result.name).toBe('Crypt');
    expect(await recordsOf(b)).toHaveLength(2);
  });

  it('names the files it could not remove again', async () => {
    const b = await bench();
    vi.mocked(b.vault.app.fileManager.trashFile).mockRejectedValue(new Error('EPERM'));

    const problem = problemOf(await failingAt(b, /assets-metadata\.json$/, 'adapter'));

    expect(problem).toMatch(/^The map could not be saved\. These files could not be removed again: /);
    expect(problem).toContain(`${SCENES}/Crypt.atlasmap`);
    expect(await recordsOf(b)).toEqual([]);
  });
});

describe('the notice of an import', () => {
  const imported: UvttImported = { ok: true, name: 'Crypt', scenePath: `${SCENES}/Crypt.atlasmap`, counts: { walls: 412, doors: 9, lights: 14 }, lightsOff: false };

  it('counts what arrived', () => {
    expect(uvttImportSummary(imported)).toBe('Imported "Crypt": 412 walls, 9 doors, 14 lights.');
    expect(uvttImportSummary({ ...imported, counts: { walls: 1, doors: 1, lights: 1 } })).toBe('Imported "Crypt": 1 wall, 1 door, 1 light.');
    expect(uvttImportSummary({ ...imported, counts: { walls: 20000, doors: 0, lights: 0 } })).toBe('Imported "Crypt": 20,000 walls, 0 doors, 0 lights.');
  });

  it('says when the lights are off and when the image lost pixels', () => {
    const scaledDown = { from: { width: 10240, height: 7680 }, to: { width: 8192, height: 6144 } };

    expect(uvttImportSummary({ ...imported, lightsOff: true, scaledDown })).toBe(
      'Imported "Crypt": 412 walls, 9 doors, 14 lights. The lights are switched off, because the image already shows their glow. The image was scaled down to 8192 × 6144 pixels.',
    );
  });
});
