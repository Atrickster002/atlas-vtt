import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type App } from 'obsidian';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER, isCampaignPath } from '../../src/app/campaigns/campaignPaths';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { parseCampaign } from '../../src/app/campaigns/campaignValidation';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const FOLDER = CAMPAIGNS_FOLDER;
const fileText = (entry: Record<string, unknown>): string => `${JSON.stringify({ format: 1, ...entry }, null, 2)}\n`;

type Handler = (...args: unknown[]) => void;

/** An in-memory vault whose events the test sends, as a sync delivering another device's change would. */
function vault(seed: Record<string, string> = {}): { app: App; files: Map<string, string>; campaigns: CampaignFiles; service: CampaignService; emit: (name: string, ...args: unknown[]) => void } {
  const { app, files } = createInMemoryApp({ files: seed });
  const handlers = new Map<string, Handler[]>();
  vi.mocked(app.vault.on).mockImplementation((name: string, handler: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    return {};
  });
  opened.push(app);
  const campaigns = CampaignFiles.open(app);
  return { app, files, campaigns, service: new CampaignService(campaigns), emit: (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); } };
}

const opened: App[] = [];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const app of opened.splice(0)) CampaignFiles.release(app);
  vi.restoreAllMocks();
});

describe('campaign paths', () => {
  it('are campaign.json directly in a campaign\'s folder, nothing deeper or beside it', () => {
    expect(isCampaignPath(`${FOLDER}/Witherwild/campaign.json`)).toBe(true);
    expect(isCampaignPath(`${FOLDER}/campaign.json`)).toBe(false);
    expect(isCampaignPath(`${FOLDER}/Witherwild/sessions/campaign.json`)).toBe(false);
    expect(isCampaignPath(`${FOLDER}/Witherwild/party.json`)).toBe(false);
    expect(isCampaignPath('atlas-vtt/collections/Witherwild/campaign.json')).toBe(false);
  });
});

describe('reading a campaign', () => {
  it('keeps what it can read and leaves the rest unset, and marks a later format read-only', () => {
    expect(parseCampaign({ id: 'c1', name: '  The Witherwild ', createdAt: 5, nextSession: '2026-10-19', worldMap: 'map-1', playtime: 3600 }))
      .toEqual({ id: 'c1', name: 'The Witherwild', createdAt: 5, nextSession: '2026-10-19', worldMap: 'map-1', playtime: 3600 });
    expect(parseCampaign({ id: 'c1', name: 'X', createdAt: 'yesterday', nextSession: 'friday', lastPlayed: -1, description: 7 })).toEqual({ id: 'c1', name: 'X', createdAt: 0 });
    expect(parseCampaign({ id: 'c1', name: '' })).toBeNull();
    expect(parseCampaign({ id: 'c1', name: 'X', format: 9 })?.readOnly).toBe(true);
  });
});

describe('CampaignFiles', () => {
  it('writes each campaign into a folder of its own, named after it, and lists the most recently played first', async () => {
    const { campaigns, files, service } = vault();
    const first = service.create('The Witherwild', 1);
    const second = service.create('Blue Mouth: Caves', 2);
    await campaigns.flush();
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).toEqual({ format: 1, id: first.id, name: 'The Witherwild', createdAt: 1 });
    expect(JSON.parse(files.get(`${FOLDER}/Blue Mouth- Caves/campaign.json`)!)).toMatchObject({ id: second.id });
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Blue Mouth: Caves', 'The Witherwild']);
  });

  it('reads the campaigns there are, leaving out files that hold none, and lets the lower path hold a duplicated id', async () => {
    const { campaigns, service } = vault({
      [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }),
      [`${FOLDER}/Witherwild (conflicted copy)/campaign.json`]: fileText({ id: 'c1', name: 'Copy', createdAt: 1 }),
      [`${FOLDER}/Broken/campaign.json`]: '{ not json',
      [`${FOLDER}/Notes/readme.md`]: 'Not a campaign.',
    });
    await campaigns.load();
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Witherwild']);
  });

  it('renames the folder with the campaign, keeps fields a newer Atlas wrote, and edits only its own', async () => {
    const { campaigns, files, service } = vault({ [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, party: ['kept'] }) });
    await campaigns.load();
    service.rename('c1', 'The Witherwild');
    service.update('c1', { description: 'Hex crawl', nextSession: '2026-10-19' });
    await campaigns.flush();
    expect(files.has(`${FOLDER}/Witherwild/campaign.json`)).toBe(false);
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).toEqual({ format: 1, id: 'c1', name: 'The Witherwild', createdAt: 1, party: ['kept'], description: 'Hex crawl', nextSession: '2026-10-19' });
    service.update('c1', { description: undefined, nextSession: '' });
    await campaigns.flush();
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).not.toHaveProperty('description');
    expect(service.get('c1')).not.toHaveProperty('nextSession');
  });

  it('applies an edit to what the file holds then, so another device\'s field survives', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }) });
    await campaigns.load();
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, worldMap: 'map-from-elsewhere' }));
    service.update('c1', { nextSession: '2026-10-19' });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).toMatchObject({ worldMap: 'map-from-elsewhere', nextSession: '2026-10-19' });
  });

  it('follows another device: a campaign arriving, changed, its folder renamed, and deleted', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service, emit } = vault();
    await campaigns.load();
    const heard: number[] = [];
    service.onChange(() => heard.push(heard.length));
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }));
    emit('create', new TFile(path));
    await settle();
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Witherwild']);
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, nextSession: '2026-11-01' }));
    emit('modify', new TFile(path));
    await settle();
    expect(service.get('c1')?.nextSession).toBe('2026-11-01');
    emit('rename', new TFolder(`${FOLDER}/Moor`), `${FOLDER}/Witherwild`);
    expect(campaigns.pathOf('c1')).toBe(`${FOLDER}/Moor/campaign.json`);
    emit('delete', new TFolder(`${FOLDER}/Moor`));
    expect(service.list()).toEqual([]);
    expect(heard.length).toBeGreaterThanOrEqual(4);
  });

  it('trashes a deleted campaign\'s whole folder, and leaves a later format\'s campaign alone', async () => {
    const { app, campaigns, files, service } = vault({
      [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }),
      [`${FOLDER}/Witherwild/sessions/001.md`]: 'Recap.',
      [`${FOLDER}/Future/campaign.json`]: fileText({ id: 'c2', name: 'Future', createdAt: 1, format: 7 }),
    });
    await campaigns.load();
    service.delete('c1');
    await campaigns.flush();
    expect(vi.mocked(app.fileManager.trashFile).mock.calls.map(([file]) => file.path)).toEqual([`${FOLDER}/Witherwild`]);
    expect([...files.keys()].some((path) => path.startsWith(`${FOLDER}/Witherwild`))).toBe(false);
    expect(() => service.rename('c2', 'Past')).toThrow();
    service.delete('c2');
    await campaigns.flush();
    expect(files.has(`${FOLDER}/Future/campaign.json`)).toBe(true);
  });

  it('names a campaign uniquely, in any letter case', async () => {
    const { campaigns, service } = vault();
    service.create('Witherwild');
    await campaigns.flush();
    expect(service.nameError('witherwild')).not.toBeNull();
    expect(service.nameError('  ')).not.toBeNull();
    expect(service.nameError('x'.repeat(121))).not.toBeNull();
    expect(service.nameError('Moor')).toBeNull();
  });
});
