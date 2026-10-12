import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { parseCampaign } from '../../src/app/campaigns/campaignValidation';
import { followCampaignRenames } from '../../src/app/campaigns/quests/followCampaignRenames';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { createQuestNote } from '../../src/app/campaigns/quests/questNotes';
import { questVault, type QuestVault } from '../mocks/questVault';

const note = (campaign: string): string => `---\natlas-type: quest\ncampaign: ${campaign}\n---\nThe text.\n`;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const opened: App[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) {
    QuestIndex.release(app);
    CampaignFiles.release(app);
  }
});

/** A vault with its campaign files, quest index and rename follower, as the plugin opens them. */
function setUp(files: Record<string, string> = {}): { vault: QuestVault; campaigns: CampaignFiles; service: CampaignService; index: QuestIndex } {
  const vault = questVault(files);
  opened.push(vault.app);
  const campaigns = CampaignFiles.open(vault.app);
  const index = QuestIndex.open(vault.app);
  followCampaignRenames(vault.app, campaigns, index);
  return { vault, campaigns, service: new CampaignService(campaigns), index };
}

describe('renaming a campaign', () => {
  it('keeps every quest its own throughout, and names the campaign anew in the notes, those in its folder too', async () => {
    const { vault, campaigns, service, index } = setUp({
      'Notes/Eggs.md': note('"[[blood olms]]"'),
      'Notes/By id.md': note('PLACEHOLDER'),
      'Notes/Other.md': note('Witherwild'),
    });
    const olms = service.create('Blood Olms', 1);
    service.create('Witherwild', 2);
    vault.write('Notes/By id.md', note(olms.id));
    await campaigns.flush();
    const folder = service.folderOf(olms.id) ?? '';
    await createQuestNote(vault.app, folder, 'Blood Olms', 'Crown', 'main');
    const titles = (): string[] => {
      const list = service.list();
      const campaign = list.find((entry) => entry.id === olms.id);
      return campaign === undefined ? [] : index.of(campaign, list).map((quest) => quest.title).sort();
    };
    expect(titles()).toEqual(['By id', 'Crown', 'Eggs']);

    service.rename(olms.id, 'Rise of the Blood Olms');
    // At once, before any note or the folder was written.
    expect(titles()).toEqual(['By id', 'Crown', 'Eggs']);
    await campaigns.flush();
    expect(service.folderOf(olms.id)).toBe(`${CAMPAIGNS_FOLDER}/Rise of the Blood Olms`);
    expect(titles()).toEqual(['By id', 'Crown', 'Eggs']);
    await settle();

    expect(vault.files.get(`${CAMPAIGNS_FOLDER}/Rise of the Blood Olms/quests/Crown.md`)).toContain('campaign: Rise of the Blood Olms');
    expect(vault.files.has(`${CAMPAIGNS_FOLDER}/Blood Olms/quests/Crown.md`)).toBe(false);
    expect(vault.files.get('Notes/Eggs.md')).toContain('campaign: Rise of the Blood Olms');
    expect(vault.files.get('Notes/By id.md')).toContain(`campaign: ${olms.id}`);
    expect(vault.files.get('Notes/Other.md')).toContain('campaign: Witherwild');
    expect(vault.files.get('Notes/Eggs.md')).toContain('The text.');
    expect(titles()).toEqual(['By id', 'Crown', 'Eggs']);
  });

  it('remembers the former name in the campaign file, so another device keeps the quests before their notes arrive', async () => {
    const { campaigns, service } = setUp();
    const olms = service.create('Blood Olms', 1);
    service.rename(olms.id, 'Rise of the Blood Olms');
    service.rename(olms.id, 'The Olms');
    // A rename back drops the name from the former names; a change of case adds none.
    service.rename(olms.id, 'Blood Olms');
    service.rename(olms.id, 'blood olms');
    await campaigns.flush();
    expect(service.get(olms.id)?.formerNames).toEqual(['Rise of the Blood Olms', 'The Olms']);
    expect(parseCampaign({ id: 'c', name: 'A', formerNames: ['a', 'B', 7, 'B', '', 'C'] })?.formerNames).toEqual(['B', 'C']);
  });

  it('writes nothing for a rename that arrives from another device', async () => {
    const { vault, campaigns, service } = setUp({ 'Notes/Eggs.md': note('Blood Olms') });
    const olms = service.create('Blood Olms', 1);
    await campaigns.flush();
    const path = service.folderOf(olms.id) ?? '';
    const text = vault.files.get(`${path}/campaign.json`) ?? '';
    vault.files.set(`${path}/campaign.json`, text.replace('"Blood Olms"', '"Rise"'));
    vault.emit('modify', vault.app.vault.getAbstractFileByPath(`${path}/campaign.json`));
    await settle();
    expect(service.get(olms.id)?.name).toBe('Rise');
    expect(vault.files.get('Notes/Eggs.md')).toContain('campaign: Blood Olms');
  });
});
