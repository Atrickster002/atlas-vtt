import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { loadStatblockOverrides } from '../../src/app/packages/components/asset-manager/utils/statblockLoader';

import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import { startingResources } from '../../src/app/resources/statblockResourceValues';

const DEFINITIONS = [HP_RESOURCE, STRESS_RESOURCE];

const path = 'statblocks/Mage.md';
afterEach(() => { delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks; });
describe('resource import', () => {
  it.each([{ hp: '27 (5d8 + 5)' }, { Health: { current: 12, max: 27 } }])('imports HP %j without replacing it with a token default', async (values) => {
    const { app } = createInMemoryApp({ files: { [path]: '' } });
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [{ name: 'Mage', path, ...values }] } });
    const result = await loadStatblockOverrides(app, path, DEFINITIONS);
    expect(result.resources?.hp).toEqual({ current: 'Health' in values ? 12 : 27, max: 27 });
  });

  it('loads inline statblock resources as well as bestiary creatures', async () => {
    const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: 27\nstress: 3\n```' } });
    app.vault.cachedRead = app.vault.read;
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
    expect((await loadStatblockOverrides(app, path, DEFINITIONS)).resources).toEqual({ hp: { current: 27, max: 27 }, stress: { current: 0, max: 3 } });
  });
});


it('uses inline resources when assigning a statblock link to existing tokens', async () => {
  const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: "12/27"\nstress: 3\n```' } });
  app.vault.cachedRead = app.vault.read;
  Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
  const service = Object.assign(Object.create(TokenStatblockLinkService.prototype), { app });
  const data = await service.extractStatblockData(path);
  expect(startingResources(data.record, DEFINITIONS)).toEqual({ hp: { current: 12, max: 27 }, stress: { current: 0, max: 3 } });
});
