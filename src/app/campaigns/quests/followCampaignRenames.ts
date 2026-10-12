import { TFile, type App } from 'obsidian';
import type { CampaignFiles } from '../CampaignFiles';
import { CampaignService } from '../CampaignService';
import { campaignOfQuest, namesFormerName } from './questCampaigns';
import { nameCampaignIn } from './questNotes';
import type { QuestIndex } from './QuestIndex';

/**
 * Keeps quest notes naming their campaign as it is called now: when this device renames a
 * campaign, every quest note that names it by a name it bore before is given the new one. The
 * campaign remembers its former names in the same write as the rename (`CampaignService.rename`),
 * so its quests stay its own until the notes are written, on this device and on others. Only the
 * device that renames writes the notes; a sync tool carries them. Returns what stops it.
 */
export function followCampaignRenames(app: App, campaigns: CampaignFiles, index: QuestIndex): () => void {
  return campaigns.onRename((id) => {
    const list = new CampaignService(campaigns).list();
    const campaign = list.find((entry) => entry.id === id);
    if (campaign === undefined) return;
    // The notes are taken now, before the campaign's folder (which may hold them) takes the new name.
    const notes = index.all().flatMap((quest) => {
      if (campaignOfQuest(quest, list)?.id !== id || !namesFormerName(quest, campaign)) return [];
      const file = app.vault.getAbstractFileByPath(quest.path);
      return file instanceof TFile ? [file] : [];
    });
    if (notes.length > 0) void nameCampaignIn(app, notes, campaign.name);
  });
}
