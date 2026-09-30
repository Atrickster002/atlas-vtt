import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { spawnEncounterTokens, spawnSelectedTokens, spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import { getLoadedAtlasView } from '../../src/app/plugin/atlasLeaves';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: vi.fn(() => null) }));
beforeEach(() => {
  vi.mocked(Notice).mockClear();
  vi.mocked(getLoadedAtlasView).mockReturnValue(null);
});

const unframed: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', showRing: false, size: 2, modifiedAt: 0 };
const framed: TokenAsset = { id: 'knight', name: 'Knight', type: 'tokens', imageUrl: 'app://knight.png', imagePath: 'tokens/knight.png', showRing: true, modifiedAt: 0 };

/** An Atlas view with a loaded scene whose store records the tokens added to it. */
function mapView(mapPath: string | null = 'maps/cave.atlasmap') {
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const spawned: Array<Record<string, unknown>> = [];
  const addTokens = vi.fn((tokens: unknown[]) => tokens.map((data) => { spawned.push(data as Record<string, unknown>); return `tok_${spawned.length}`; }));
  const setSelection = vi.fn();
  const view = {
    leaf: {},
    serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null }) },
    getStore: () => ({ getState: () => ({ mapPath, addTokens, setSelection }) }),
  } as unknown as AtlasView;
  return { view, spawned, addTokens, setSelection };
}

function setup(records: Record<string, Partial<TokenAsset>> = {}) {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.png': '', 'tokens/knight.png': '' } });
  app.workspace.revealLeaf = vi.fn(async () => undefined);
  const { view, spawned, addTokens, setSelection } = mapView();
  const ctx: SpawnContext = {
    app,
    view,
    assetService: {
      getAssetById: vi.fn(async (id: string) => (id in records ? { id, type: 'token', name: id, imagePath: `tokens/${id}.png`, ...records[id] } : null)),
    } as unknown as AssetService,
  };
  return { ctx, spawned, addTokens, setSelection };
}

describe('token spawning keeps asset defaults', () => {
  it('spawns several selected assets with each one\'s ring setting and size', async () => {
    const { ctx, spawned, setSelection } = setup();
    const ids = await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(ids).toHaveLength(2);
    expect(spawned.map(t => [t.name, t.showRing, t.size])).toEqual([['Goblin', false, 2], ['Knight', true, undefined]]);
    expect(setSelection).toHaveBeenCalledWith(ids);
  });

  it('prefers the service record over the asset manager view model', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true, size: 3, imagePath: 'tokens/goblin-v2.png' } });
    await spawnSelectedTokens(ctx, [unframed]);
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin-v2.png', showRing: true, size: 3 });
  });

  it('spawns copies of a single asset without the ring when it is disabled', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false } });
    await spawnTokenAsset(ctx, unframed, 2);
    expect(spawned.map(t => t.showRing)).toEqual([false, false]);
  });

  it('spawns several copies of one asset in a single batch, each on its own spot', async () => {
    const { ctx, spawned, addTokens, setSelection } = setup();
    const ids = await spawnTokenAsset(ctx, unframed, 4);
    expect(ids).toHaveLength(4);
    expect(addTokens).toHaveBeenCalledTimes(1);
    expect(new Set(spawned.map(t => `${t.x},${t.y}`)).size).toBe(4);
    expect(setSelection).toHaveBeenCalledWith(ids);
  });

  it('spawns a token without a statblock with no hit points, so it shows no resource bar', async () => {
    const { ctx, spawned } = setup();
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]).not.toHaveProperty('hp');
  });

  it('skips assets that have no image path', async () => {
    const { ctx, spawned } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ids = await spawnSelectedTokens(ctx, [{ ...framed, imagePath: undefined, imageUrl: '' }, unframed]);
    expect(ids).toHaveLength(1);
    expect(spawned[0]?.name).toBe('Goblin');
  });
});

describe('encounter spawning', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });

  it('frames tokens added from the asset manager like their token asset', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false }, knight: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 },
      { id: 'knight', name: 'Knight', imagePath: 'tokens/knight.png', size: 1 },
    ]));
    expect(spawned.map(t => [t.name, t.showRing])).toEqual([['Goblin', false], ['Knight', true]]);
  });

  it('restores the ring saved with a token captured from a map', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'map-token', name: 'Goblin', imagePath: 'tokens/goblin.png', state: { kind: 'token', imagePath: 'tokens/goblin.png', showRing: false } },
    ]));
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin.png', showRing: false });
  });
});

describe('spawning from the global asset manager', () => {
  const ambush: EncounterAsset = {
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], modifiedAt: 0, tokenPreviews: [],
    tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png' }],
  };
  const spawns: Array<[string, (ctx: SpawnContext) => Promise<string[]>]> = [
    ['a token', (ctx) => spawnTokenAsset(ctx, unframed, 1)],
    ['selected tokens', (ctx) => spawnSelectedTokens(ctx, [unframed])],
    ['an encounter', (ctx) => spawnEncounterTokens(ctx, ambush)],
  ];

  it.each(spawns)('adds %s to the open scene and brings it to the front', async (_label, spawn) => {
    const { ctx } = setup();
    const open = mapView();
    vi.mocked(getLoadedAtlasView).mockReturnValue(open.view);
    const ids = await spawn({ ...ctx, view: null });
    expect(ids).toEqual(['tok_1']);
    expect(open.spawned.map(t => t.name)).toEqual(['Goblin']);
    expect(open.setSelection).toHaveBeenCalledWith(ids);
    expect(ctx.app.workspace.revealLeaf).toHaveBeenCalledWith(open.view.leaf);
  });

  it.each(spawns)('tells the user no scene is open when adding %s without one', async (_label, spawn) => {
    const { ctx } = setup();
    const ids = await spawn({ ...ctx, view: null });
    expect(ids).toEqual([]);
    expect(vi.mocked(Notice).mock.calls).toEqual([[expect.stringContaining('No scene is open')]]);
  });

  it('does not add tokens to an Atlas view whose scene has not loaded', async () => {
    const { ctx } = setup();
    const empty = mapView(null);
    vi.mocked(getLoadedAtlasView).mockReturnValue(empty.view);
    expect(await spawnTokenAsset({ ...ctx, view: null }, unframed, 1)).toEqual([]);
    expect(empty.addTokens).not.toHaveBeenCalled();
    expect(vi.mocked(Notice)).toHaveBeenCalledTimes(1);
  });
});
