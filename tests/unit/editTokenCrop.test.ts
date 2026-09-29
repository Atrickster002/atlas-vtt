import { beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import { STORED_IMAGE_SCALE } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';
import type { EditTokenInput, TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom cannot decode or encode images; the crop itself is covered by cropMath's tests
const bakeTokenCrop = vi.hoisted(() => vi.fn(async (file: File) => file));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/bakeTokenCrop', () => ({ bakeTokenCrop }));
vi.mock('../../src/app/utils/imageOptimizer', () => ({
  OPTIMIZATION_PRESETS: { token: {}, map: {} },
  optimizeImage: vi.fn(async () => ({ blob: { arrayBuffer: async () => new TextEncoder().encode('cropped').buffer } })),
}));
vi.mock('../../src/app/services/AssetThumbnailService', () => ({
  AssetThumbnailService: { getInstance: () => ({ tryCreateForImage: async (path: string) => `thumbs/${path}` }) },
}));

beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  bakeTokenCrop.mockClear();
});

async function setup(stored: string, showRing: boolean) {
  const { app, files } = createInMemoryApp({ files: { [stored]: 'original art' } });
  app.workspace = { trigger: vi.fn() };
  const assetService = AssetService.getInstance(app);
  const token = await assetService.addTokenAsset({ name: 'Acolyte', imagePath: stored, tags: [], collection: 'Default', showRing });
  const editToken: EditTokenInput = { id: token.id, name: 'Acolyte', imageUrl: `app://vault/${stored}`, imagePath: stored, tags: [], showRing };
  const preview: TokenPreview = {
    id: token.id, name: 'Acolyte', tags: [], showRing: true, file: null, previewUrl: editToken.imageUrl,
    imageScale: STORED_IMAGE_SCALE, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
  };
  const save = (changes: Partial<TokenPreview> = {}): Promise<number> => saveTokenPreviews({
    app, assetService, mode: 'token', previews: [{ ...preview, ...changes }], collection: 'Default', tags: [],
    editToken, waitForOptimized: async () => undefined,
  });
  return { app, files, assetService, token, save };
}

const stored = 'atlas-vtt/collections/Default/tokens/Acolyte.webp';

it('crops the stored image into its own file when the ring is turned on', async () => {
  const { app, files, assetService, token, save } = await setup(stored, false);
  expect(await save()).toBe(1);
  expect(bakeTokenCrop).toHaveBeenCalledWith(expect.any(File), STORED_IMAGE_SCALE, { x: 0, y: 0 });
  expect(files.get(stored)).toBe('cropped');
  expect(app.vault.createBinary).not.toHaveBeenCalled();
  expect(await assetService.getAssetById(token.id)).toMatchObject({ imagePath: stored, showRing: true });
});

it('crops the stored image where the edit moved or zoomed it', async () => {
  const { files, save } = await setup(stored, true);
  expect(await save({ imageScale: 1.2, imagePosition: { x: 0.1, y: -0.05 } })).toBe(1);
  expect(bakeTokenCrop).toHaveBeenCalledWith(expect.any(File), 1.2, { x: 0.1, y: -0.05 });
  expect(files.get(stored)).toBe('cropped');
});

it('leaves the image alone when a ringed token is saved with its crop untouched', async () => {
  const { app, files, save } = await setup(stored, true);
  expect(await save({ name: 'Renamed' })).toBe(1);
  expect(bakeTokenCrop).not.toHaveBeenCalled();
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
  expect(files.get(stored)).toBe('original art');
});

it('renames an image of another format to .webp before writing the crop', async () => {
  const png = 'atlas-vtt/collections/Default/tokens/Acolyte.png';
  const { files, assetService, token, save } = await setup(png, false);
  expect(await save()).toBe(1);
  const webp = 'atlas-vtt/collections/Default/tokens/Acolyte.webp';
  expect(files.has(png)).toBe(false);
  expect(files.get(webp)).toBe('cropped');
  expect((await assetService.getAssetById(token.id))?.imagePath).toBe(webp);
});
