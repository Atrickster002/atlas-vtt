import type { Campaign } from '../campaignTypes';
import type { Quest } from './questTypes';

/** What a quest note is matched against: a campaign's id, its name and the names it bore before. */
export type QuestCampaign = Pick<Campaign, 'id' | 'name' | 'formerNames'>;

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The campaign a quest note belongs to, among `campaigns`: the one it names by id, else the one
 * that bears the name it names (in any case), else the one that bore that name before, so a quest
 * stays its campaign's while a rename has not reached its note yet. Undefined for none.
 */
export function campaignOfQuest<T extends QuestCampaign>(quest: Pick<Quest, 'campaign'>, campaigns: readonly T[]): T | undefined {
  const named = quest.campaign;
  return campaigns.find((campaign) => campaign.id === named)
    ?? campaigns.find((campaign) => sameName(campaign.name, named))
    ?? campaigns.find((campaign) => campaign.formerNames?.some((former) => sameName(former, named)) === true);
}

/** The quests of `quests` that belong to `campaign`, `campaigns` being every campaign of the vault. */
export function questsOfCampaign(quests: readonly Quest[], campaign: QuestCampaign, campaigns: readonly QuestCampaign[]): Quest[] {
  return quests.filter((quest) => campaignOfQuest(quest, campaigns)?.id === campaign.id);
}

/** Whether a quest note names its campaign by a name the campaign no longer bears, and so is to be written anew. */
export function namesFormerName(quest: Pick<Quest, 'campaign'>, campaign: QuestCampaign): boolean {
  return quest.campaign !== campaign.id && !sameName(quest.campaign, campaign.name);
}
