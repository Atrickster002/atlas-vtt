import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../../../src/app/services/AssetService';
import { followStatblockImage } from '../../../../src/app/services/followStatblockImage';
import { TokenStatblockLinkService, type LinkChangeEvent } from '../../../../src/app/services/TokenStatblockLinkService';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const NOTE = 'Bestiary/Goblin.md';
const TOKEN_ART = 'atlas-vtt/assets/goblin.webp';
const OTHER_TOKEN_ART = 'atlas-vtt/assets/goblin-boss.webp';
const MAP = 'atlas-vtt/collections/Default/scenes/Cave.atlasmap';
const SCENE = JSON.stringify({ version: 4, state: { version: 4, objects: { tokens: {
  t1: { id: 't1', kind: 'character', imagePath: TOKEN_ART, x: 0, y: 0, name: 'Goblin', statblockPath: NOTE, hp: { current: 3, max: 7 } },
} } } });

interface Linked {
  service: TokenStatblockLinkService;
  assets: AssetService;
  files: Map<string, string>;
  events: LinkChangeEvent[];
}

/** A native statblock linked to token art that goblins on a closed map use, with their hit points. */
async function linkedGoblin(): Promise<Linked> {
  const { app, files } = createInMemoryApp({ files: { [NOTE]: '---\nstatblock: true\n---\n', [MAP]: SCENE } });
  app.workspace = { ...app.workspace, trigger: vi.fn() };
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.addTokenAsset({ name: 'Goblin', imagePath: TOKEN_ART, statblockPath: NOTE, tags: [], collection: 'Default' });
  const service = TokenStatblockLinkService.getInstance(app);
  const events: LinkChangeEvent[] = [];
  service.on('link-changed', (event: LinkChangeEvent) => events.push(event));
  return { service, assets, files, events };
}

beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});

describe('a statblock note\'s image and its token link', () => {
  it.each([
    ['names other art, a full-body illustration', 'Art/goblin-full.png'],
    ['is cleared', null],
  ])('keeps the link and every map\'s values when the Portrait %s', async (_case, image) => {
    const { service, files, events } = await linkedGoblin();

    expect(await followStatblockImage(service, NOTE, image)).toBeNull();

    expect(await service.getTokenLinkedToStatblock(NOTE)).toBe(TOKEN_ART);
    expect(files.get(MAP)).toBe(SCENE);
    expect(events).toEqual([]);
  });

  it('leaves a link alone that the image names already', async () => {
    const { service, events } = await linkedGoblin();

    expect(await followStatblockImage(service, NOTE, TOKEN_ART)).toBe(TOKEN_ART);
    expect(events).toEqual([]);
  });

  it('moves the link to another token the image names, every change marked as the note\'s', async () => {
    const { service, assets, events } = await linkedGoblin();
    await assets.addTokenAsset({ name: 'Goblin boss', imagePath: OTHER_TOKEN_ART, tags: [], collection: 'Default' });

    expect(await followStatblockImage(service, NOTE, OTHER_TOKEN_ART)).toBe(OTHER_TOKEN_ART);

    expect(await service.getTokenLinkedToStatblock(NOTE)).toBe(OTHER_TOKEN_ART);
    expect(events).toEqual([
      expect.objectContaining({ type: 'unlinked', tokenImagePath: TOKEN_ART, fromNote: true }),
      expect.objectContaining({ type: 'linked', tokenImagePath: OTHER_TOKEN_ART, statblockPath: NOTE, fromNote: true }),
    ]);
  });
});
